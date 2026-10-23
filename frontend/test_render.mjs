import { createServer } from 'vite';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

global.localStorage = {
  getItem: () => 'dark',
  setItem: () => {},
};
global.window = {
  location: { href: 'http://localhost:3000' }
};
global.document = {
  documentElement: {
    setAttribute: () => {},
  }
};
global.fetch = () => Promise.resolve({ json: () => Promise.resolve([]) });

async function test() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  try {
    const mod = await vite.ssrLoadModule('/src/App.jsx');
    const App = mod.default;
    const html = ReactDOMServer.renderToString(React.createElement(App));
    console.log("RENDER SUCCESS, length:", html.length);
    console.log("HTML preview:", html.slice(0, 500));
  } catch (err) {
    console.error("REACT RENDER ERROR CAUGHT:", err);
  } finally {
    await vite.close();
  }
}

test();
