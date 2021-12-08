export const SOCKET_URL =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'https://localhost:4001/';

export type MediaConstraints = {
  audio: boolean;
  video: boolean;
  screen: boolean;
};
