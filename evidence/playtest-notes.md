# Monkey Bananas release playtest

- Production build tested at 1280 × 720 in the in-app browser using the game-specific simulated pointer provider.
- Completed the real authored flow without rebuilding by performing five bottom-to-top-to-bottom pointer cycles: two jumps in round one, two in round two, and one in round three.
- Confirmed the pointer adapter moves the full simulated body for takeoff and landing while camera providers remain the unmodified engine default.
- Confirmed continuous feedback in the gameplay capture: 1/5 aggregate progress, caught-banana check mark, jump prompt, basket, monkey reaction, and current 1/2 scene objective.
- Confirmed the terminal capture reaches 5/5 with the localized full-basket celebration, five caught markers, basket contents, and confetti.
- Simulator mode renders the bundled same-origin jungle artwork beneath interactive entities and HUD; camera mode remains a direct, mirrored, cover-fit video layer.
- Korean copy was exercised in the captured run. English copy, reduced-motion behavior, valid and intentionally invalid fixtures, and the full five-jump pack flow are covered by automated release gates.
- No camera permission, account, remote runtime CDN, analytics, or network-transmitted frames were required for this simulator playtest.
