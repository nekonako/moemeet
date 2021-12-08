import { Worker, Consumer /*Producer*/ } from 'mediasoup/node/lib/types';
import * as mediasoup from 'mediasoup';
import fs from 'fs';
import https from 'https';
import path from 'path';
import socketIO from 'socket.io';
import { config } from './sfu/config';
import Room from './sfu/room';
import Peer from './sfu/peer';

let worker: Worker;
let webserver: https.Server;
let socketServer: socketIO.Server;
let consumer: Consumer;
let roomList: Map<string, Room> = new Map();

export default async function main() {
  try {
    await runWebServer();
    await runMediasoupWorker();
    await runSocketServer();
  } catch (err) {
    console.log('failed to start app');
    console.log(err);
  }
}

async function runWebServer() {
  const { sslCrt, sslKey } = config;
  const tls = {
    cert: fs.readFileSync(path.join(__dirname, '..', sslCrt)),
    key: fs.readFileSync(path.join(__dirname, '..', sslKey)),
  };

  webserver = https.createServer(tls);
  webserver.on('error', (err) => {
    console.log('starting webserver failed', err);
  });

  const { listenIp, listenPort } = config;
  webserver.listen(listenPort, listenIp, () => {
    const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
    const ip = listenIps.announcedIp || listenIps.ip;
    console.log('web server is running');
    console.log(`https://${ip}:${listenPort}`);
  });
}

async function runSocketServer() {
  console.log('try to run socket server');

  socketServer = new socketIO.Server(webserver, {
    transports: ['websocket'],
    serveClient: false,
    path: '/server',
    cors: { origin: 'http://localhost:3000', methods: ['GET', 'POST'] },
  });

  socketServer.on('connection', (socket) => {
    console.log('client connected');

    // handle if user create room
    socket.on('createRoom', async ({ room_id }, cb) => {
      if (roomList.has(room_id)) {
        cb('already exist');
      } else {
        console.log('Created room', { room_id: room_id });
        roomList.set(room_id, new Room(room_id, 'cok', worker, socketServer));
        cb(room_id);
      }
    });

    // handle if user join into exist room
    socket.on('join', ({ room_id, name }, cb) => {
      console.log('User joined room', {
        room_id: room_id,
        name: name,
      });
      if (!roomList.has(room_id)) {
        return cb({
          error: 'Room does not exist',
        });
      }

      roomList.get(room_id).addPeer(new Peer(socket.id, name));
      socket['room_id'] = room_id;

      cb(roomList.get(room_id).toJson());
    });

    socket.on('getProducers', () => {
      if (!roomList.has(socket['room_id'])) return;
      console.log('get Producers', {
        name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
      });

      let producerList = roomList.get(socket['room_id']).getProducerListPeer();
      socket.emit('newProducers', producerList);
    });

    socket.on('getRouterRtpCapabilities', (_, cb) => {
      console.log('get router rtpCapabilities', {
        name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
      });

      try {
        cb(roomList.get(socket['room_id']).getRtpCapabilities());
      } catch (err) {
        cb({ err });
      }
    });

    socket.on('createWebRtcTransport', async (_, cb) => {
      console.log('Create webrtc transport', {
        name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
      });

      try {
        const { params } = await roomList
          .get(socket['room_id'])
          .createWebRtcTransport(socket.id);
        cb(params);
      } catch (err) {
        console.log('create webrtc transport failed', err);
        cb({ err });
      }
    });

    socket.on(
      'connectTransport',
      async ({ transport_id, dtlsParameters }, cb) => {
        console.log('connect transport', {
          name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
        });
        if (!roomList.has(socket['room_id'])) return;
        await roomList
          .get(socket['room_id'])
          .connectPeerTransport(socket.id, transport_id, dtlsParameters);
        cb('success');
      }
    );

    socket.on(
      'produce',
      async ({ kind, rtpParameters, producerTransportId }, cb) => {
        if (!roomList.has(socket['room_id'])) {
          return cb({ error: 'not is a room' });
        }

        let producer_id = await roomList
          .get(socket['room_id'])
          .produce(socket.id, producerTransportId, rtpParameters, kind);

        console.log('produce', {
          type: kind,
          name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
          id: producer_id,
        });

        cb({ producer_id });
      }
    );

    socket.on(
      'consume',
      async ({ consumerTransportId, producerId, rtpCapabilities }, cb) => {
        let params = await roomList
          .get(socket['room_id'])
          .consume(socket.id, consumerTransportId, producerId, rtpCapabilities);

        console.log('consuming', {
          name: roomList.get(socket['room_id']).getPeers().get(socket.id).name,
          producer_id: producerId,
          consumer_id: params.id,
        });

        cb(params);
      }
    );

    socket.on('resume', async (_, cb) => {
      await consumer.resume();
      cb();
    });

    socket.on('disconnect', () => {
      console.log('Disconnect', {
        name: `${
          roomList.get(socket['room_id']) 
        }`,
      });

      if (!socket['room_id']) return;
      roomList.get(socket['room_id']).removePeer(socket.id);
    });
  });
}

async function runMediasoupWorker() {
  try {
    worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
      console.error(
        'mediasoup worker died, exiting in 2 seconds.... [pid:%d]',
        worker.pid
      );
      setTimeout(() => process.exit(1), 2000);
    });
  } catch (err) {
    console.log('error create worker', err);
  }
}
