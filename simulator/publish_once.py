import json
import time
import uuid
from datetime import datetime

import paho.mqtt.client as mqtt

BROKER = 'localhost'
PORT = 1883
ASSAY = 'ensaio_001'

client = mqtt.Client(client_id=f'publisher_once_{ASSAY}')
client.connect(BROKER, PORT, 60)
client.loop_start()

def publish(flask_id, p, t):
    now = datetime.utcnow().isoformat() + 'Z'
    payload = {
        'schema_version': 1,
        'msg_id': f'dash_demo_{flask_id}_{int(time.time())}',
        'assay_id': ASSAY,
        'flask_id': flask_id,
        'timestamp': now,
        'ts': now,
        'P_bar_abs': p,
        'T_C': t
    }
    topic = f'rumen/{ASSAY}/{flask_id}/telemetry'
    client.publish(topic, json.dumps(payload), qos=1)
    print(f'Published to {topic}: {payload}')

# Valores dentro dos ranges válidos
publish(3, 1.18, 38.1)
publish(3, 1.24, 38.6)
publish(4, 1.12, 37.4)
publish(4, 1.28, 36.9)

# Aguarda envio
time.sleep(2)
client.loop_stop()
client.disconnect