import { createServer } from 'vite';

async function testAll() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  const files = [
    '/src/components/Header.jsx',
    '/src/pages/LandingPage.jsx',
    '/src/pages/Inputpage.jsx',
    '/src/pages/ResultsPage.jsx',
    '/src/pages/LiteratureReview.jsx',
    '/src/pages/PaperDraft.jsx',
    '/src/pages/HistoryPage.jsx',
    '/src/App.jsx',
    '/src/main.jsx'
  ];

  for (const f of files) {
    try {
      await vite.ssrLoadModule(f);
      console.log("OK:", f);
    } catch (err) {
      console.error("FAIL:", f, err);
    }
  }

  await vite.close();
}

testAll();
