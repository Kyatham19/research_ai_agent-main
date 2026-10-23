# Frequently Asked Questions

This page answers the most common questions and problems users encounter when installing or using Research AI Agent.

---

## Q1: I get a "GEMINI_API_KEY not set" error when I run the app. What do I do?

**Problem:** When you try to run an analysis, the app returns an error message indicating that the Gemini API key is missing or not recognized.

**Resolution:**

1. **Confirm the `.env` file exists.** Open your file explorer and navigate to the `backend/` folder inside the project. Look for a file named `.env` (with the leading dot). Note that some operating systems hide files that start with a dot by default — enable "show hidden files" if you are not sure.

2. **Check the file contents.** Open the `.env` file in any text editor. It should contain exactly one line:
   ```
   GEMINI_API_KEY=your_actual_key_here
   ```

3. **Make sure there are no quotation marks.** The key value must not be wrapped in single or double quotes. This is wrong:
   ```
   GEMINI_API_KEY="AIza..."
   ```
   This is correct:
   ```
   GEMINI_API_KEY=AIza...
   ```

4. **Check for extra spaces.** There should be no spaces before or after the `=` sign, and no trailing space after the key value.

5. **Restart the server after making any changes.** The server reads the `.env` file only at startup. Stop the server (press `Ctrl+C` in the terminal), then run `python app.py` again.

6. **Verify your API key is valid.** Log in to [aistudio.google.com](https://aistudio.google.com/), go to your API keys, and confirm the key is active. If necessary, generate a new key.

---

## Q2: Analysis is very slow. Is something wrong?

**Problem:** Running a topic search takes a long time — sometimes several minutes.

**Resolution:**

This is expected behavior. The app makes one AI call to Google's Gemini API for each paper it analyzes, plus one more call to generate the combined synthesis. These calls are the bottleneck, not your internet speed or computer's processing power.

**Approximate timing:**
- 5 papers: 30 to 60 seconds
- 10 papers: 1 to 2 minutes
- 20 papers: 3 to 5 minutes

**To get faster results:**

- **Reduce the paper count.** Change the number of papers from 5 (default) down to 3 or even 1 for a quick overview. You can always run a second search with more papers once you have identified the most relevant sub-topics.
- **Use Text or URL mode for single papers.** If you already have a paper's text or URL, these modes skip the database search phase and go straight to analysis.

There is currently no way to parallelize the Gemini API calls beyond what the app already does. If the analysis appears to have stalled completely (no activity for more than 5 minutes), check the terminal window running the server for error messages.

---

## Q3: No papers were found for my topic. What should I try?

**Problem:** The app runs a search but returns zero results, or very few results that are not relevant.

**Resolution:**

**Try a broader or differently phrased topic.** The app queries academic paper databases using the topic text you enter. Very niche or highly specific topics may return fewer results than the relevance threshold requires.

For example:
- Instead of `"quantum error correction in photonic topological insulators at room temperature"`, try `"topological insulator quantum computing"`.
- Instead of using acronyms alone (e.g., `BERT`), try the full name: `"BERT bidirectional transformer language model"`.

**Other things to try:**

- Rephrase using different terminology. Different subfields sometimes use different names for the same concept.
- Remove highly specific constraints (years, specific datasets, specific locations) from the topic and filter results manually after the search.
- Switch to a different input mode: if you have a paper's PDF or URL, use PDF or URL mode to analyze it directly without relying on the database search.

---

## Q4: PDF upload fails or the analysis returns no useful content. What is wrong?

**Problem:** You upload a PDF and either get an error, or the analysis returns vague or empty results.

**Resolution:**

The most common cause is that the PDF is a **scanned image** rather than a text-based PDF.

**How to tell the difference:**
- Open the PDF in a standard PDF reader and try to select and copy some text. If you can select and copy words, the PDF is text-based and should work.
- If clicking on the page selects the whole page as an image (or nothing at all), the PDF is a scan and does not contain machine-readable text.

**What to do if your PDF is scanned:**

- Search for a publisher's digital version of the paper (most journals offer one).
- Check [arXiv](https://arxiv.org/) — many papers have a freely available preprint with proper text encoding.
- Use the URL Analysis mode with a link to the paper's abstract page.

**Other things to check:**

- Ensure the file is a valid PDF (not a corrupted download). Try opening it in your PDF reader to confirm it is intact.
- Very large PDFs (hundreds of pages) may take longer than expected. Research papers are typically fine; textbooks or reports with hundreds of pages may be slow.

---

## Q5: Installing PyMuPDF fails. Do I need to fix this?

**Problem:** Running `pip install pymupdf==1.23.8` produces a build error.

**Resolution:**

**No action is required.** This is a known limitation on Python 3.14, where PyMuPDF cannot be compiled from source. The app is designed to handle this automatically.

When the app starts, it checks whether PyMuPDF is available. If it is not, it falls back to `pdfminer.six`, which is already installed as part of the standard dependency set (Step 3 in the Getting Started guide). PDF uploads continue to work correctly — the only difference is that text extraction may be slightly slower on very large files.

**If you want faster PDF parsing:** Install Python 3.11 or lower, create a new virtual environment with that Python version, and then `pip install pymupdf==1.23.8` will succeed.

**If you are not on Python 3.14:** A build failure for PyMuPDF on older Python versions may indicate a missing build tool. On Windows, try installing the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). On macOS, run `xcode-select --install`. On Linux, install `python3-dev` and `build-essential` via your package manager.

---

## Q6: Where exactly is my data stored? Is it sent to the cloud?

**Problem:** You want to know where your research data lives and whether any of it is uploaded to external servers.

**Answer:**

All workspace data is stored **locally on your computer** in the following folder inside the project:

```
backend/data/workspaces/
```

Inside this folder, each analysis session is stored as a subfolder named `workspace_<id>/`. These folders contain:

- `metadata.json` — workspace name, creation date, and settings
- `results.json` — the full analysis output for all papers
- `chat.json` — any chat history for this workspace
- `uploads/` — any PDF files you uploaded for this workspace

**What is sent externally:**

- The text of papers (or your uploaded text) is sent to Google's Gemini API for AI analysis. This is necessary for the AI features to work. Refer to [Google's privacy policy](https://policies.google.com/privacy) for details on how API data is handled.
- No data is sent to any other external service. Paper metadata is fetched from public academic databases (arXiv, Semantic Scholar, OpenAlex, PubMed) as part of normal search operation.

**No proprietary cloud storage is used.** The project does not have a backend server of its own beyond your local machine.

---

## Q7: How do I reset the app and clear all my data?

**Problem:** You want to start fresh — removing all workspaces, uploaded files, and analysis history.

**Resolution:**

1. Stop the server if it is running (press `Ctrl+C` in the terminal).
2. Navigate to `backend/data/workspaces/` in your file explorer.
3. Delete the contents of the `workspaces/` folder (all the `workspace_<id>/` subfolders inside it). You can delete the subfolders individually or select all and delete them at once.
4. Leave the `workspaces/` folder itself in place — only delete the subfolders inside it.
5. Restart the server with `python app.py`.

When you next open the app, the sidebar will be empty and you will start with a clean slate.

> **Caution:** This permanently deletes all your analysis results and uploaded PDFs. There is no undo. If you may want to refer to past work later, consider moving the `workspaces/` folder to a backup location rather than deleting it.

---

## Q8: Can I share this app with my team or access it over the internet?

**Problem:** You want to let colleagues use the app, or access it from a different device.

**Answer:**

Research AI Agent is currently designed for **local, single-user use**. By default, it only accepts connections from the same machine it is running on (`localhost`).

**Sharing on a local network (same Wi-Fi or office network):**

When you start the server with `python app.py`, it typically also binds to `0.0.0.0`, which means other devices on the same network can reach it using your machine's local IP address (e.g., `http://192.168.1.x:5000`). Check your terminal output for the address.

**Making it available over the internet:**

This requires additional configuration not covered in the basic documentation:

- Run the app on a server with a public IP address.
- Set up a reverse proxy (such as nginx or Caddy) to handle HTTPS and route traffic to the Flask server.
- Consider authentication if others should not have unrestricted access.

Refer to `docs/operations/deployment.md` for server deployment notes (if available), or consult your IT team for assistance with network configuration.

---

## Q9: The frontend shows a blank page or the wrong application when I open the browser. What do I do?

**Problem:** Opening `http://localhost:5000` shows a blank white page, a "cannot connect" error, or an unexpected default page.

**Resolution:**

Work through these checks in order:

**Check 1 — Did you build the frontend?**
The most common cause of a blank page is that the React frontend was never compiled. The server needs a built copy of the frontend to serve.

In your terminal, navigate to the `frontend/` folder and run:
```
npm install
npm run build
```

Wait for both commands to complete successfully. You should see a `frontend/dist/` folder created or updated afterward.

**Check 2 — Is the server running?**
Go to the terminal where you ran `python app.py`. Confirm it is still running and has not produced any error messages. If it stopped, start it again.

**Check 3 — Restart the server after building**
If you just ran `npm run build` and the server was already running, stop the server (`Ctrl+C`) and start it again (`python app.py`). The server needs to restart to serve the newly built files.

**Check 4 — Clear your browser cache**
Sometimes browsers cache an old (broken) version of the page. Try a hard refresh (`Ctrl+Shift+R` on Windows/Linux, `Cmd+Shift+R` on macOS) or open the app in a private/incognito window.

**Check 5 — Check the terminal for error messages**
Any startup errors are printed in the terminal running the server. Look for red text or lines containing `Error` or `Traceback` and compare them against this FAQ or the Getting Started guide.

---

## Q10: The Literature Review feature says it needs at least 2 papers. How do I get papers into the system?

**Problem:** You open the Literature Review panel but there are no papers to select, or not enough to meet the 2-paper minimum.

**Resolution:**

The Literature Review Generator works from papers that have already been analyzed and saved to your workspaces. It does not search for papers on its own.

**To get papers into the system:**

1. Go back to the main input page.
2. Use **Topic Research** mode — enter a topic, set the number of papers to at least 2, and click **Analyze**. The app will search the academic databases and save the results to a new workspace.
3. Once the analysis completes, return to the Literature Review panel in the sidebar.
4. You should now see the papers from your analysis available for selection.

**Tips:**
- You can combine papers from multiple workspaces in a single literature review. Run several Topic Searches on related topics and then select the most relevant papers from each when generating the review.
- PDF Analysis and URL Analysis also add papers to your workspaces, so you can mix papers found via search with papers you uploaded manually.
- There is no upper limit enforced on the number of papers you can select for a review, but selecting 5 to 15 papers generally produces the most coherent and useful output.
