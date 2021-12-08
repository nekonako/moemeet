import { Socket } from "socket.io-client"

export interface MySocket extends Socket {
  request: (event : string, data? : any) => Promise<any>
}
