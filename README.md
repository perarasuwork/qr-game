# UPS Scan & Solve

An interactive, mobile-assisted quiz. The main screen shows a QR code and four
answer options. Participants scan the code with their phone to reveal the
question, then choose their answer on the main screen — mirroring the warehouse
habit of scanning a barcode to pull up package information.

**10 questions across two sections**, pitched at medium difficulty:

- **UPS** — tracking numbers, ORION, package cars vs feeders, dimensional
  weight, Proof of Delivery
- **QA** — smoke and regression testing, severity vs priority, UAT, boundary
  value analysis

## Running it

Double-click `index.html`. That's it — no install, no build step, no internet
needed. Press `F11` for fullscreen when projecting.

## How a round works

1. Enter a team name, pick the round length and timer, press **Start the round**.
2. The main screen shows a QR code plus four options — but *not* the question.
3. Participants point a phone camera at the code to read the question.
4. They call out or pick the answer on the main screen.
5. After each answer the correct option, the question and a short explanation
   appear for the debrief.
6. The results screen gives a per-category breakdown and a full question review.

**Facilitator keyboard shortcuts** (main screen): `A`–`D` or `1`–`4` to answer,
`Enter` to advance, `R` to show the question on the main screen.

## Two ways the question reaches the phone

The app picks automatically based on how you opened it.

| Opened as | QR contains | Phone shows |
| --- | --- | --- |
| `file://` (double-click) | The question text itself | The text in the camera app's scan result |
| `http://` / `https://` (hosted) | A link back to this page | A full-screen, styled question page |

Text mode needs nothing at all and is the safest choice if venue Wi-Fi is
unpredictable. Hosted mode looks better and avoids long questions being
truncated in the camera banner.

To use hosted mode, put these files on any static web host (GitHub Pages,
SharePoint, an internal web server), or serve them from the presenting laptop
over Wi-Fi:

```
cd path/to/QR_Game
python -m http.server 8000
```

Then open `http://<laptop-ip>:8000` on the laptop — phones on the same network
can reach it. `localhost` is deliberately treated as text mode, since phones
cannot reach the laptop's localhost.

## The shared leaderboard

By default the leaderboard is per-laptop: it lives in the browser's own storage
and nobody else can see it. To make it global — so a score set on your laptop
shows up on your friends' laptops — fill in one block at the top of
`leaderboard.js`.

### Firebase Firestore (recommended)

Free forever on the Spark plan, no credit card, and 20,000 writes a day against
a quiz that needs one write per round.

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add
   project** (skip Analytics)
2. **Build → Firestore Database → Create database**, start in *production* mode
3. **Rules** tab → paste this → **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /scores/{doc} {
         allow read: if true;
         allow create: if true;
         allow update, delete: if false;
       }
     }
   }
   ```

4. **Project settings → General → Your apps → `</>`**, register a web app, and
   copy `projectId` and `apiKey` out of the snippet it shows you
5. Paste those two values into the `firestore` block in `leaderboard.js`

That's the whole setup. The `apiKey` is safe to publish — it identifies the
project, it does not grant access. The rules above are what control access:
anyone can add a score and read the board, nobody can edit or delete one.

### SharePoint or a Teams channel

Possible, but not self-serve, so don't let a session depend on it:

| Route | Verdict |
| --- | --- |
| SharePoint REST from the browser | **No.** No anonymous write, and no CORS for a `github.io` origin. |
| MSAL sign-in → Microsoft Graph → SharePoint list | Works, but needs an Entra app registration (IT approval) and **every player signs in** with a Cognizant account. Nobody outside the tenant can play. |
| Teams incoming webhook | Can *push* scores into a channel, but there is no way to read them back, so no leaderboard. Microsoft is retiring these connectors. |
| Power Automate HTTP trigger → SharePoint list | The one that fits — anonymous POST, flow writes the row. But that trigger is a **premium** connector, so it depends on your licence. |

If you get a Power Automate flow URL, put it in the `flow` block instead of the
`firestore` one; the rest of the game is unchanged. The comments in
`leaderboard.js` give the request schema and the CORS header the flow must
return.

### What happens when the network misbehaves

Every score is written to the local browser *first*, then uploaded. An upload
that fails is queued and retried the next time the leaderboard is opened, so a
dropped Wi-Fi connection cannot lose a round. If the board can't be reached the
screen falls back to this laptop's scores and says so.

Your own rounds are highlighted on the board, so you can find yourself among
everyone else's.

### Clearing the board

**Clear leaderboard** asks for a facilitator password, set as `adminPin` at the
top of `leaderboard.js` (currently `2005`).

> **This is a speed bump, not security.** The game is a public static page, so
> anyone can open view-source or devtools and read the password in about ten
> seconds. It stops a participant clearing the board on a whim. It does not
> stop anyone who actually wants to, and no static page can — keeping a secret
> needs a backend with real sign-in.

What the password clears depends on `allowGlobalClear`:

| `allowGlobalClear` | Firestore rules | Clear button does |
| --- | --- | --- |
| `false` *(default)* | `allow delete: if false` | Clears **this laptop's copy** only. Everyone else's scores are safe, and so are yours on the shared board. |
| `true` | `allow delete: if true` | Wipes the **shared board for everyone**, then this laptop's copy. |

If you want the second row, change both — the config flag *and* the rules. The
rules are the only real gate, so be clear-eyed about the trade-off: once deletes
are allowed, anyone who reads the password out of the file (or just calls the
API directly) can reset the board. Leaving the default means a reset is a
deliberate act in the Firebase console: **Firestore → `scores` collection →
delete**.

Setting `adminPin: ''` removes the prompt entirely.

## Editing the questions

Open `questions.js` in any text editor and save. No tools required.

```js
{
  category: 'QA',
  question: 'What is the purpose of smoke testing?',
  options: [
    'A quick check that a new build\'s critical features work',   // correct answer first
    'An exhaustive run of every test case in the suite',
    'Testing only the changes made since the last release',
    'Load testing the application until it fails'
  ],
  answer: 0,
  explain: 'Smoke testing answers "is this build stable enough to ...'
}
```

Put the correct answer first and leave `answer: 0` — the app **always** shuffles
the option order on screen, so position never gives the answer away.

Use `category: 'UPS'` or `category: 'QA'`. To add a third section, add its name
to the `CATEGORIES` list at the top of the file so it appears in the score
breakdown, and update the **Questions this round** options in `index.html` if
you change the total count.

A short round is spread evenly across the sections, so picking 6 gives you
3 UPS and 3 QA.

Keep questions under roughly 100 characters. Longer ones still work, but the QR
gets denser and some phone camera apps truncate long text in the scan banner.

> **Content check:** the UPS questions were drafted from general operational
> knowledge. Have an operations SME or your L&D team confirm the answers against
> your own training material before running the session.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure for all screens |
| `styles.css` | Styling, including the separate phone layout |
| `app.js` | Game logic, timer, scoring, phone view |
| `questions.js` | The question bank — **edit this one** |
| `leaderboard.js` | Score storage — **edit this one** to make the board global |
| `qr.js` | Self-contained QR encoder, so no CDN or internet is needed |

## Hosting it on GitHub Pages

1. Push these files to a repo
2. **Settings → Pages → Deploy from a branch**, pick `main` and `/ (root)`
3. Open the `https://<you>.github.io/<repo>/` URL it gives you

Serving over HTTPS also switches the QR codes into hosted mode, so phones open
a properly styled question page instead of showing raw text.

## Notes

- Scores go to whatever `leaderboard.js` is configured for — this laptop only
  by default, or a shared board once you fill in a backend.
- The timer is optional. With it off, teams can take as long as they like.
- Every team gets the same 10 questions, so the leaderboard is a fair comparison.
  Only the order and the on-screen option order change between rounds.
