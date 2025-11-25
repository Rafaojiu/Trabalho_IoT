const net = require('net');
const aedes = require('aedes')();

const PORT = 1883;

const server = net.createServer(aedes.handle);

server.listen(PORT, () => {
  console.log(`✅ MQTT broker (Aedes) rodando em tcp://localhost:${PORT}`);
});

aedes.on('clientReady', (client) => {
  console.log(`🔌 Cliente conectado: ${client ? client.id : 'desconhecido'}`);
});

aedes.on('publish', (packet, client) => {
  // Ignorar mensagens internas $SYS
  if (packet && packet.topic && !packet.topic.startsWith('$SYS')) {
    console.log(`📨 Publish: topic=${packet.topic} by=${client ? client.id : 'server'}`);
  }
});

aedes.on('subscribe', (subscriptions, client) => {
  console.log(`📡 Subscribe: ${subscriptions.map(s => s.topic).join(', ')} by=${client ? client.id : 'unknown'}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`🔌 Cliente desconectado: ${client ? client.id : 'desconhecido'}`);
});