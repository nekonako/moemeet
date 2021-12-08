import { useEffect, useRef, useState } from 'react';
import shortId from 'short-unique-id';
import { useRouter } from 'next/router';

export default function Index() {
  const username = useRef(null);
  const [showModal, setShowModal] = useState(null);
  const router = useRouter();
  const roomId = useRef(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      });

    const username = localStorage.getItem('username');
    if (username) {
      setShowModal(false);
    } else {
      setShowModal(true);
    }
  }, []);

  const createRoom = () => {
    const id = new shortId({ length: 10 });
    router.push(id());
  };

  const joinRoom = () => {
    router.push(roomId.current.value);
  };

  const setUsername = () => {
    console.log(username.current.value);
    localStorage.setItem('username', username.current.value);
    setShowModal(false);
  };

  return (
    <>
      <Modal username={username} buttonClick={setUsername} show={showModal} />
      <div className="my-8 px-4 md:mx-32 h-full w-full">
        <div className="flex flex-row w-full justify-between">
          <div>
            <input
              placeholder="room id"
              className="rounded-md px-4 py-2 bg-dark-secondary mr-4"
              ref={roomId}
            />
            <button
              className="bg-purple rounded-md px-4 py-2 text-dark-secondary"
              onClick={joinRoom}
            >
              join room
            </button>
          </div>
          <div>
            <button
              className="bg-green rounded-md px-4 py-2 text-dark-secondary"
              onClick={createRoom}
            >
              create room
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Modal({ username, buttonClick, show }) {
  return show ? (
    <>
      <div className="fixed pin z-50 min-w-full min-h-full overflow-auto bg-dark-primary flex">
        <div className="relative p-8 bg-dark-secondary rounded-md w-full max-w-md m-auto flex-col flex">
          <div className="text-center pb-4">
            Atur username kamu terlebh dahulu
          </div>
          <input
            type="text"
            placeholder="username"
            className="rounded-md px-4 py-2 bg-dark-primary"
            ref={username}
          />
          <div className="inline-block text-center pt-6">
            <button
              onClick={buttonClick}
              className="bg-purple rounded-md px-4 py-2 text-dark-secondary"
            >
              masuk
            </button>
          </div>
        </div>
      </div>
    </>
  ) : null;
}
