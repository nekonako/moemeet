import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { ClientRoom } from '../modules/client_room';

export default function Room() {
  const router = useRouter();
  const [clientRoom, setClientRoom] = useState<ClientRoom>(null);
  const remoteStream = useRef(null);
  const localStream = useRef(null);
  const [mute, setMute] = useState(false)

  useEffect(() => {
    let roomId = router.query.roomId;

    if (clientRoom == null && typeof window !== undefined) {
      setClientRoom(new ClientRoom());
    }

    const username = localStorage.getItem('username');
    if (clientRoom) {
      clientRoom
        .createRoom(String(roomId))
        .then((data) => {
          console.log(data);
          clientRoom.joinRoom(username, String(roomId)).then(async (data) => {
            console.log(data);
            clientRoom.initSocket();
            await clientRoom.produce({
              audio: true,
              video: true,
              screen: false,
            });
            localStream.current.srcObject = clientRoom.localStream; 
            let timeout = 0;
            const interval = setInterval(() => {
              if (clientRoom.remoteStream) {
                console.log(clientRoom.remoteStream);
                remoteStream.current.srcObject = clientRoom.remoteStream;
                clearInterval(interval);
              }
              timeout += 1;
              if (timeout === 50) {
                clearInterval(interval);
                console.log(
                  'timeout when trying to consume stream, because more than 50 seconds'
                );
              }
            }, 1000);
          });
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }, [clientRoom]);

  const muteToggle = () => {
    setMute(!mute)
    clientRoom.localStream.getAudioTracks()[0].enabled
      ? (clientRoom.localStream.getAudioTracks()[0].enabled = false)
      : (clientRoom.localStream.getAudioTracks()[0].enabled = true);
  };

  return (
    <>
      <div className="my-8 px-4 md:mx-32 h-full w-full flex flex-row justify-center">
        <div>
          <div className="font-bold text-green text-center text-lg mb-4">
            remote video
          </div>
          <div className="p-4 bg-dark-secondary rounded-lg text-center w-full">
            <video className="rounded-lg" width="500" autoPlay ref={remoteStream} />
          </div>
        </div>
        <div className="ml-4">
          <div className="font-bold text-green text-center text-lg mb-4">
            Local Video
          </div>
          <div className="p-4 bg-dark-secondary rounded-lg flex text-center w-full">
            <video className="rounded-lg" width="500" autoPlay ref={localStream} />
          </div>
          <div className="bg-dark-secondary p-4">
            {!mute && (
              <button
                onClick={muteToggle}
                className="px-4 py-2 border-2 rounded-md border-green text-green"
              >
                mute
              </button>
            )}

            {mute && (
              <button
                onClick={muteToggle}
                className="px-4 py-2 border-2 rounded-md border-red text-red"
              >
                muted
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
