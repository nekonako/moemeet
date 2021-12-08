import { MySocket } from '../lib/MySocket';
import { Device } from 'mediasoup-client';
import { Transport } from 'mediasoup-client/lib/Transport';
import { Producer } from 'mediasoup-client/lib/Producer';
import { Consumer } from 'mediasoup-client/lib/Consumer';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import * as mediasoup from 'mediasoup-client';
import io from 'socket.io-client';
import { MediaConstraints, SOCKET_URL } from '../constants';

export class ClientRoom {
  constructor() {
    // don't mind this :)
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      path: '/server',
    });

    this.socket.request = (event: string, data?: any) => {
      return new Promise((resolve) => {
        this.socket.emit(event, data, resolve);
      });
    };

    this.socket.on('connect', () => {
      console.log('connected');
    });
  }

  socket: MySocket;
  device: Device;
  producerTransport: Transport;
  consumerTransport: Transport;
  producers: Map<string, Producer> = new Map();
  consumers: Map<string, Consumer> = new Map();
  remoteStream: MediaStream;
  localStream: MediaStream;

  async createRoom(room_id: string) {
    try {
      return await this.socket.request('createRoom', { room_id });
    } catch (err) {
      console.log(err);
    }
  }

  async joinRoom(name: string, room_id: string) {
    return await this.socket
      .request('join', { name, room_id })
      .then(async (res) => {
        const data = await this.socket.request('getRouterRtpCapabilities');
        const device = await this.loadDevice(data);
        this.device = device;
        await this.initTransports(device);
        this.socket.emit('getProducers');
        return res;
      })
      .catch((err) => console.log(err));
  }

  async loadDevice(routerRtpCapabilities: RtpCapabilities) {
    let device: Device;
    try {
      device = new mediasoup.Device();
      await device.load({ routerRtpCapabilities });
    } catch (err) {
      if (err.name === 'UnsuprtedError') {
        alert('browser not supported webrtc');
      }
      console.log(err);
    }
    return device;
  }

  async initTransports(device: Device) {
    // producer transport
    {
      const data = await this.socket.request('createWebRtcTransport', {
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
      });

      if (data.error) {
        console.log(data.error);
        return;
      }

      this.producerTransport = device.createSendTransport(data);

      this.producerTransport.on(
        'connect',
        async ({ dtlsParameters }, cb, err) => {
          this.socket
            .request('connectTransport', {
              dtlsParameters,
              transport_id: data.id,
            })
            .then(cb)
            .catch(err);
        }
      );

      this.producerTransport.on(
        'produce',
        async ({ kind, rtpParameters }, cb, errback) => {
          try {
            const { producer_id } = await this.socket.request('produce', {
              producerTransportId: this.producerTransport.id,
              kind,
              rtpParameters,
            });
            cb({ id: producer_id });
          } catch (err) {
            errback(err);
          }
        }
      );

      this.producerTransport.on('connectionstatechange', (state) => {
        console.log('connection state change', state);
      });
    }

    // consumer transport
    {
      const data = await this.socket.request('createWebRtcTransport', {
        forceTcp: false,
      });

      if (data.error) {
        console.log(data.error);
        return;
      }

      this.consumerTransport = device.createRecvTransport(data);

      this.consumerTransport.on(
        'connect',
        async ({ dtlsParameters }, cb, err) => {
          this.socket
            .request('connectTransport', {
              dtlsParameters,
              transport_id: data.id,
            })
            .then(cb)
            .catch(err);
        }
      );

      this.consumerTransport.on('connectionstatechange', (state) => {
        console.log('connection state change', state);
      });
    }
  }

  initSocket() {
    console.log('init socket');
    this.socket.on('newProducers', (data) => {
      console.log('new producer');
      for (let { producer_id } of data) {
        console.log('data', data);
        this.consume(producer_id).catch((err) => {
          console.log(err);
        });
      }
    });
  }

  async produce(mediaConstraints: MediaConstraints) {
    try {
      console.log('contrait', mediaConstraints);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: mediaConstraints.audio,
        video: mediaConstraints.video,
      });

      const track = stream.getVideoTracks()[0];

      this.localStream = stream;
      const params = {
        track,
      };

      params['endcodings'] = [
        {
          rid: 'r0',
          maxBitrate: 100000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r1',
          maxBitrate: 300000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r2',
          maxBitrate: 900000,
          scalabilityMode: 'S1T3',
        },
      ];

      params['codecOptions'] = {
        videoGoogleStartBitrate: 1000,
      };

      const producer = await this.producerTransport.produce(params);
      this.producers.set(producer.id, producer);
    } catch (err) {
      console.log('error while produce stream', err);
    }
  }

  async consume(producerId: string) {
    this.getConsumeStream(producerId).then(({ consumer, stream, kind }) => {
      this.consumers.set(consumer.id, consumer);
      this.remoteStream = stream;
    });
  }

  async getConsumeStream(producerId: string) {
    const { rtpCapabilities } = this.device;
    const data = await this.socket.request('consume', {
      rtpCapabilities,
      consumerTransportId: this.consumerTransport.id,
      producerId,
    });
    const { id, kind, rtpParameters } = data;
    const consumer = await this.consumerTransport.consume({
      id,
      producerId,
      kind,
      rtpParameters,
    });

    console.log(consumer);

    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    return {
      consumer,
      stream,
      kind,
    };
  }
}
