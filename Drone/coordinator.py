"""Recebe alertas da central e fotografa um setor com o Tello.

O programa inicia em simulação. --arm habilita voo automático para cada alerta
válido, depois de a base, os ângulos e a área de operação terem sido calibrados.
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LOG = logging.getLogger("valkyreye.drone")


def load_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    required = (
        "serial_port", "baud_rate", "outbox_dir", "database_path",
        "min_battery_percent", "capture_count", "capture_interval_seconds",
        "flight_area_ready", "sensors",
    )
    for key in required:
        if key not in config:
            raise ValueError(f"Configuração sem {key}")
    if not config["sensors"]:
        raise ValueError("Cadastre ao menos um sensor")
    if type(config["flight_area_ready"]) is not bool:
        raise ValueError("flight_area_ready deve ser booleano")
    if not 0 < config["min_battery_percent"] <= 100:
        raise ValueError("min_battery_percent inválido")
    if not 1 <= config["capture_count"] <= 10:
        raise ValueError("capture_count deve estar entre 1 e 10")
    if config["capture_interval_seconds"] < 0:
        raise ValueError("capture_interval_seconds inválido")
    return config


def resolve_config_path(config_file: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else config_file.parent / path


def parse_alert(raw: bytes) -> dict[str, Any]:
    if len(raw) > 1024:
        raise ValueError("Linha serial longa demais")
    alert = json.loads(raw.decode("utf-8"))
    if not isinstance(alert, dict) or alert.get("version") != 1:
        raise ValueError("Versão ou estrutura do alerta inválida")
    sensor_id = alert.get("sensor_id")
    if not isinstance(sensor_id, str) or not sensor_id or len(sensor_id) > 64:
        raise ValueError("sensor_id inválido")
    if not all(c.isalnum() or c in "-_" for c in sensor_id):
        raise ValueError("sensor_id contém caracteres inválidos")
    for key in ("sequence", "servo_angle_deg", "distance_cm"):
        value = alert.get(key)
        if type(value) is not int or value < 0:
            raise ValueError(f"{key} inválido")
    if alert["sequence"] > 2**32 - 1 or alert["servo_angle_deg"] > 180:
        raise ValueError("Sequência ou ângulo fora do intervalo")
    if alert["distance_cm"] == 0:
        raise ValueError("Distância inválida")
    return alert


def mission_yaw(
    alert: dict[str, Any], config: dict[str, Any], require_calibrated: bool
) -> int:
    sensor = config["sensors"].get(alert["sensor_id"])
    if sensor is None:
        raise ValueError("Sensor não cadastrado")
    if require_calibrated and sensor.get("calibrated") is not True:
        raise ValueError("Sensor ainda não calibrado para voo")
    angle = alert["servo_angle_deg"]
    if not sensor["min_servo_angle_deg"] <= angle <= sensor["max_servo_angle_deg"]:
        raise ValueError("Ângulo fora do setor cadastrado")
    if sensor["servo_direction"] not in (-1, 1):
        raise ValueError("servo_direction deve ser -1 ou 1")
    yaw = sensor["yaw_at_servo_zero_deg"] + sensor["servo_direction"] * (
        angle - sensor["servo_zero_deg"]
    )
    if not -180 <= yaw <= 180:
        raise ValueError("Rotação fora do limite configurado")
    return round(yaw)


def init_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(path)
    database.execute(
        "CREATE TABLE IF NOT EXISTS alerts ("
        "sensor_id TEXT NOT NULL, sequence INTEGER NOT NULL, "
        "received_at TEXT NOT NULL, status TEXT NOT NULL, error TEXT, "
        "PRIMARY KEY (sensor_id, sequence))"
    )
    database.commit()
    return database


def record_alert(database: sqlite3.Connection, alert: dict[str, Any]) -> bool:
    cursor = database.execute(
        "INSERT OR IGNORE INTO alerts "
        "(sensor_id, sequence, received_at, status) VALUES (?, ?, ?, 'received')",
        (alert["sensor_id"], alert["sequence"], datetime.now(timezone.utc).isoformat()),
    )
    database.commit()
    return cursor.rowcount == 1


def set_status(
    database: sqlite3.Connection, alert: dict[str, Any], status: str, error: str | None = None
) -> None:
    database.execute(
        "UPDATE alerts SET status = ?, error = ? WHERE sensor_id = ? AND sequence = ?",
        (status, error, alert["sensor_id"], alert["sequence"]),
    )
    database.commit()


def capture_with_tello(
    alert: dict[str, Any], yaw: int, config: dict[str, Any], outbox: Path
) -> None:
    # Importação tardia mantém o modo de simulação independente do hardware.
    from djitellopy import Tello
    from PIL import Image

    drone = Tello()
    airborne = False
    streaming = False
    frames: list[Path] = []
    prefix = f"{alert['sensor_id']}-{alert['sequence']}"
    try:
        drone.connect()
        battery = drone.get_battery()
        if battery < config["min_battery_percent"]:
            raise RuntimeError(f"Bateria insuficiente: {battery}%")
        drone.streamon()
        streaming = True
        frame_reader = drone.get_frame_read()
        for _ in range(10):
            if frame_reader.frame is not None:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError("Vídeo indisponível antes da decolagem")

        drone.takeoff()
        airborne = True
        if yaw > 0:
            drone.rotate_clockwise(yaw)
        elif yaw < 0:
            drone.rotate_counter_clockwise(-yaw)
        time.sleep(1)

        for index in range(config["capture_count"]):
            if drone.get_battery() < config["min_battery_percent"]:
                raise RuntimeError("Bateria abaixo do limite durante a captura")
            frame = frame_reader.frame
            if frame is None:
                raise RuntimeError("Fluxo de vídeo interrompido")
            destination = outbox / f"{prefix}-{index + 1}.jpg"
            # DJITelloPy entrega o quadro no formato BGR.
            Image.fromarray(frame[:, :, ::-1]).save(destination, quality=90)
            frames.append(destination)
            if index + 1 < config["capture_count"]:
                time.sleep(config["capture_interval_seconds"])
    finally:
        try:
            if airborne:
                try:
                    drone.land()
                except Exception:
                    LOG.exception("Falha ao comandar pouso; operador deve intervir")
                    raise
        finally:
            if streaming:
                try:
                    drone.streamoff()
                except Exception:
                    LOG.warning("Não foi possível desligar o vídeo")
            drone.end()

    metadata = {
        "version": 1,
        "sensor_id": alert["sensor_id"],
        "sequence": alert["sequence"],
        "servo_angle_deg": alert["servo_angle_deg"],
        "distance_cm": alert["distance_cm"],
        "tello_yaw_deg": yaw,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "images": [path.name for path in frames],
        "upload_status": "pending",
    }
    (outbox / f"{prefix}.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def handle_alert(
    raw: bytes, config: dict[str, Any], database: sqlite3.Connection,
    outbox: Path, armed: bool,
) -> None:
    alert = parse_alert(raw)
    yaw = mission_yaw(alert, config, require_calibrated=armed)
    if not record_alert(database, alert):
        LOG.info("Alerta duplicado: %s/%s", alert["sensor_id"], alert["sequence"])
        return
    LOG.info("Alerta %s/%s: servo=%s°, Tello=%s°", alert["sensor_id"],
             alert["sequence"], alert["servo_angle_deg"], yaw)
    if not armed:
        set_status(database, alert, "simulated")
        return
    try:
        set_status(database, alert, "flying")
        capture_with_tello(alert, yaw, config, outbox)
        set_status(database, alert, "captured")
    except Exception as exc:
        set_status(database, alert, "failed", str(exc))
        LOG.exception("Missão falhou para %s/%s", alert["sensor_id"], alert["sequence"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    parser.add_argument("--arm", action="store_true", help="habilita decolagem automática")
    parser.add_argument("--stdin", action="store_true", help="lê eventos da entrada padrão")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config_file = args.config.resolve()
    config = load_config(config_file)
    if args.arm and not config["flight_area_ready"]:
        parser.error("Para armar, confirme flight_area_ready no arquivo de configuração")
    outbox = resolve_config_path(config_file, config["outbox_dir"])
    outbox.mkdir(parents=True, exist_ok=True)
    database = init_database(resolve_config_path(config_file, config["database_path"]))
    LOG.info("Modo: %s", "VOO AUTOMÁTICO" if args.arm else "simulação")
    try:
        if args.stdin:
            import sys
            for raw in sys.stdin.buffer:
                try:
                    handle_alert(raw, config, database, outbox, args.arm)
                except (ValueError, UnicodeError, json.JSONDecodeError):
                    LOG.exception("Alerta inválido")
        else:
            import serial
            with serial.Serial(config["serial_port"], config["baud_rate"], timeout=1) as port:
                while True:
                    raw = port.read_until(b"\n", size=1025)
                    if not raw:
                        continue
                    try:
                        handle_alert(raw, config, database, outbox, args.arm)
                    except (ValueError, UnicodeError, json.JSONDecodeError):
                        LOG.exception("Alerta inválido")
    except KeyboardInterrupt:
        LOG.info("Encerrando coordenador")
    finally:
        database.close()


if __name__ == "__main__":
    main()
