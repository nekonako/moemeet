import '../styles/global.css';
import Head from 'next/head';
import type { AppProps } from 'next/app';
import { CLientRoomProvider } from '../modules/client_room_provider';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>MoeMeet</title>
        <meta name="application-name" content="moechat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="msapplication-config"
          content="/static/icons/browserconfig.xml"
        />
        <meta name="msapplication-TileColor" content="#1b2224" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#1b2224" />
      </Head>

             <div className="flex flex-col h-full min-h-screen font-sans text-base antialiased bg-dark-primary text-white transition-all duration-300 md:flex-row">
          <Component {...pageProps} />
        </div>
      
    </>
  );
}

export default MyApp;
