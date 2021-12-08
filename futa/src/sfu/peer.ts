import { Consumer } from 'mediasoup/node/lib/Consumer';
import { Producer } from 'mediasoup/node/lib/Producer';
import {
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup/node/lib/RtpParameters';
import { Transport } from 'mediasoup/node/lib/Transport';
import { DtlsParameters } from 'mediasoup/node/lib/WebRtcTransport';

export default class Peer {
  constructor(socket_id: string, name: string) {
    this.id = socket_id;
    this.name = name;
    this.producers = new Map();
    this.transports = new Map();
    this.consumers = new Map();
  }

  id: string;
  name: string;
  transports: Map<string, Transport>;
  consumers: Map<string, Consumer>;
  producers: Map<string, Producer>;

  addTransport(transport: Transport) {
    this.transports.set(transport.id, transport);
  }

  async connectTransport(transport_id: string, dtlsParameters: DtlsParameters) {
    if (!this.transports.has(transport_id)) return;
    await this.transports.get(transport_id).connect({
      dtlsParameters,
    });
  }

  async createProducer(
    transportId: string,
    rtpParameters: RtpParameters,
    kind: MediaKind
  ) {
    let producer = await this.transports.get(transportId).produce({
      kind,
      rtpParameters,
    });

    this.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      console.log('producer Transport close', {
        name: `${this.name}`,
        consumer_id: `${producer.id}`,
      });
      producer.close();
      this.producers.delete(producer.id);
    });
    return producer;
  }

  async createConsumer(
    consumer_transport_id: string,
    producer_id: string,
    rtpCapabilities: RtpCapabilities
  ) {
    let consumerTransport = this.transports.get(consumer_transport_id);

    let consumer: Consumer = null;
    try {
      consumer = await consumerTransport.consume({
        producerId: producer_id,
        rtpCapabilities,
        paused: false,
      });
    } catch (err) {
      console.log('consume failed', err);
    }

    this.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      console.log('consumer transport close', {
        name: `${this.name}`,
        consumer_id: `${consumer.id}`,
      });
      this.consumers.delete(consumer.id);
    });

    return {
      consumer,
      params: {
        producerId: producer_id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      },
    };
  }

  closeProducer(producer_id: string) {
    try {
      this.producers.get(producer_id).close();
    } catch (err) {
      console.log('error close producer', err);
    }
    this.producers.delete(producer_id);
  }

  getProducer(producer_id: string) {
    return this.producers.get(producer_id);
  }

  close() {
    this.transports.forEach((transport) => transport.close());
  }

  removeConsumer(consumer_id: string) {
    this.consumers.delete(consumer_id);
  }
}
