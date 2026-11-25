# Ícones do ArkoBot

Todos saem de [`mark.svg`](mark.svg) (o símbolo em quadrado 1024 com cantos arredondados, fundo `#050817`, traço `#00E8F8`). Depois de editar o símbolo:

```bash
node scripts/arkobot-icons.mjs          # reescreve todos
node scripts/arkobot-icons.mjs --check  # falha se algum estiver desatualizado
```

`scripts/testing/arkobot-icons.test.ts` confere que os arquivos batem com o símbolo e que têm os tamanhos e formatos que os instaladores pedem.

| Arquivo | Tamanho | Formato | Onde aparece |
| --- | --- | --- | --- |
| `build/icon.svg` | vetor 1024 | SVG | Linux: ícone escalável do pacote (hicolor/scalable) |
| `build/icon-1024.png` | 1024×1024 | PNG RGBA | Fonte em bitmap para o empacotamento |
| `build/icon.ico` | 16, 24, 32, 48, 64, 128 (BMP 32 bits) e 256 (PNG) | ICO | Windows: app, atalho, instalador NSIS |
| `build/icon.icns` | 16 a 1024, com @2x (`icp4`–`ic14`) | ICNS (PNG por dentro) | macOS: app e DMG |
| `build/icon.iconset/icon_{16,32,64,128,256,512}x…[@2x].png` | 16 a 1024 | PNG RGBA | macOS: fonte para `iconutil` |
| `electron/resources/app-icon.png` | 1024×1024 | PNG RGBA | Janela, bandeja (Windows/Linux, reduzido a 20 px), ícone de empréstimo na barra de menus (18 px), sobreposição de não lidas (16 px), caixa do "Fale com" |
| `public/app-icon.svg` | vetor 1024 | SVG | Favicon do app web e logo da tela de boas-vindas (marca padrão) |
| `public/app-icon-192.png` | 192×192 | PNG RGBA | Manifesto do app web (instalação no celular) |
| `public/app-icon-512.png` | 512×512 | PNG RGBA | Manifesto do app web |
| `public/apple-touch-icon.png` | 180×180 | PNG, quadrado sem cantos (o iOS arredonda) | Tela inicial do iPhone/iPad |
| `apps/portal/public/favicon.svg` | vetor 1024 | SVG | Favicon e logo do portal |
| `docs/arkobot/mark-symbol.svg` | vetor 1024 | SVG, fundo transparente | Símbolo para usar sobre superfícies do próprio app |
| `docs/arkobot/mark-mono.svg` | vetor 1024 | SVG, preto sobre transparente | Imagem-modelo (template) da barra de menus do macOS, se um dia o app usar uma |

Fora do script:

- [`logo.svg`](logo.svg) e [`logo.png`](logo.png): o logo com o nome ("arko" branco, "bot" ciano), para o README e materiais. O texto do SVG depende das fontes instaladas; o PNG é a referência.
- `public/abertura/arkobot.mp4` (vídeo de abertura do app desktop, com som) e `public/abertura/arkobot-poster.jpg` (quadro do logo completo, 1280×720).
- [`arkobot-loading-icone-protagonista-1920x1080.mp4`](arkobot-loading-icone-protagonista-1920x1080.mp4): a animação original da tela de carregamento do app de PC (H.264, 1920×1080, 30 fps, 5,8 s, sem áudio). Dela saem `electron/resources/startup-splash.webm` (recorte 704×480 centrado no conteúdo, redimensionado para 880×600 = 2× da janela 440×300, VP9 sem áudio, com os últimos 0,4 s em fusão com o início para o loop não ter emenda) e `electron/resources/startup-splash-poster.webp` (o quadro em 0,4 s, primeiro do loop), que `electron/startup-screen.mjs` embute na página. Para refazer:

  ```bash
  F="crop=704:480:608:303,scale=880:600:flags=lanczos,format=yuv420p,setsar=1,split[a][b];[a]trim=0:0.4,setpts=PTS-STARTPTS[h];[b]trim=0.4:5.8,setpts=PTS-STARTPTS[c];[c][h]xfade=transition=fade:duration=0.4:offset=5[v]"
  for pass in 1 2; do ffmpeg -y -i docs/arkobot/arkobot-loading-icone-protagonista-1920x1080.mp4 -filter_complex "$F" -map "[v]" -an \
    -c:v libvpx-vp9 -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 1 -pass $pass $([ $pass = 1 ] && echo "-f null /dev/null" || echo electron/resources/startup-splash.webm); done
  ffmpeg -y -ss 0.4 -i electron/resources/startup-splash.webm -frames:v 1 -c:v libwebp -quality 82 electron/resources/startup-splash-poster.webp
  ```
- `build/background.png` e `build/background@2x.png` (fundo da janela do DMG) não têm a marca e ficaram como estavam.
