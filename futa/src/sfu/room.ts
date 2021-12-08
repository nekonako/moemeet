import { Router } from 'mediasoup/node/lib/Router';
import {
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup/node/lib/RtpParameters';
import { DtlsParameters } from 'mediasoup/node/lib/WebRtcTransport';
import { Worker } from 'mediasoup/node/lib/Worker';
import { Server } from 'socket.io';
import { config } from './config';
import Peer from './peer';

export default class Room {
  constructor(room_id: string, name: string, worker: Worker, io: Server) {
    this.id = room_id;
    const mediaCodecs = config.mediasoup.router.mediaCodecs;

    worker
      .createRouter({
        mediaCodecs,
      })
      .then((router) => (this.router = router))
      .catch((err) => console.log('create router failed', err));

    this.peers = new Map();
    this.io = io;
    this.name = name;
  }

  id: string;
  name: string;
  router: Router;
  peers: Map<string, Peer>;
  io: Server;

  addPeer(peer: Peer) {
    this.peers.set(peer.id, peer);
  }

  getProducerListPeer() {
    let producerList = [];
    this.peers.forEach((peer) => {
      peer.producers.forEach((producer) => {
        producerList.push({ producer_id: producer.id });
      });
    });
    return producerList;
  }

  getRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  async createWebRtcTransport(socket_id: string) {
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate, listenIps } =
      config.mediasoup.webRtcTransport;

    const transport = await this.router.createWebRtcTransport({
      listenIps: listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
    });

    if (maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
      } catch (err) {}
    }

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        console.log('Transport close', {
          name: this.peers.get(socket_id).name,
        });
        transport.close();
      }
    });

    transport.on('close', () => {
      console.log('transport close', { name: this.peers.get(socket_id).name });
    });

    console.log('adding transport', { transportId: transport.id });
    this.peers.get(socket_id).addTransport(transport);

    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  async connectPeerTransport(
    socket_id: string,
    transport_id: string,
    dtlsParameters: DtlsParameters
  ) {
    if (!this.peers.has(socket_id)) return;
    await this.peers
      .get(socket_id)
      .connectTransport(transport_id, dtlsParameters);
  }

  async produce(
    socket_id: string,
    producer_tansport_id: string,
    rtpParameters: RtpParameters,
    kind: MediaKind
  ) {
    return new Promise(async (resolve, _) => {
      let producer = await this.peers
        .get(socket_id)
        .createProducer(producer_tansport_id, rtpParameters, kind);
      resolve(producer.id);
      this.broadCast(socket_id, 'newProducers', [
        {
          producer_id: producer.id,
          producer_tansport_id: socket_id,
        },
      ]);
    });
  }

  async consume(
    socket_id: string,
    consumer_transport_id: string,
    producer_id: string,
    rtpCapabilities: RtpCapabilities
  ) {
    if (
      !this.router.canConsume({
        producerId: producer_id,
        rtpCapabilities,
      })
    ) {
      console.log('can not consume');
    }

    let { consumer, params } = await this.peers
      .get(socket_id)
      .createConsumer(consumer_transport_id, producer_id, rtpCapabilities);

    consumer.on('producerclose', () => {
      console.log('consumer closed due to produce close event', {
        name: this.peers.get(socket_id).name,
        consumer_id: consumer.id,
      });

      this.peers.get(socket_id).removeConsumer(consumer.id);
      this.io.to(socket_id).emit('consumerClosed', {
        consumer_id: consumer.id,
      });
    });
    return params;
  }

  async removeProducer(socket_id: string) {
    this.peers.get(socket_id).close();
    this.peers.delete(socket_id);
  }

  closeProducer(socket_id: string, producer_id: string) {
    this.peers.get(socket_id).closeProducer(producer_id);
  }

  broadCast(socket_id: string, name: string, data: any) {
    for (let otherID of Array.from(this.peers.keys()).filter(
      (id) => id !== socket_id
    )) {
      this.send(otherID, name, data);
    }
  }

  send(socket_id: string, name: string, data: any) {
    this.io.to(socket_id).emit(name, data);
  }

  getPeers() {
    return this.peers;
  }

  removePeer(socket_id: string) {
    this.peers.get(socket_id).close();
    this.peers.delete(socket_id);
  }

  toJson() {
    return {
      id: this.id,
      peers: JSON.stringify([...this.peers]),
    };
  }
}
