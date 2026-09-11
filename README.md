# File Shelf

A small static website for sharing temporary files through GitHub Pages.

## How it works

- Put files inside the `file` folder.
- Commit and push to GitHub.
- Open the website from another device and download the files.
- Remove files from the `file` folder, commit, and push again when you no longer need them online.

The page reads the public GitHub repo folder through the GitHub Contents API, so it can show any file type placed in `file` without editing a manual file list.

## Add or remove files

```powershell
git add .
git commit -m "Update shared files"
git push
```

After GitHub Pages finishes publishing, refresh the website.

## Important limitation

This site has no database or backend. A static GitHub Pages website can list and download files, but it cannot safely upload files from the browser or delete files after someone downloads them.

For browser upload/delete, use a storage backend such as Firebase Storage, Supabase Storage, Google Drive, SharePoint, or a small server/API.
