<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Both existing ENVISION and RealityViewer consume canonical-assembly geometry, extracted from the historical ENVISION renderer, so semantic specs and known-subject fallbacks stay consistent without claiming physical verification; unknown subjects use named interpretive diagram points only.
- Keep the dedicated Three.js workbench; automatically upgrade to a delivered GLB only when the current assembly is unedited, otherwise require an explicit replacement to preserve edits.
