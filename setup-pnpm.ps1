$node = 'C:\Program Files\nodejs\node.exe'
$corepack = 'C:\Program Files\nodejs\node_modules\corepack\dist\corepack.js'
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& $node $corepack enable
& $node $corepack prepare pnpm@latest --activate
$pnpmShim = 'C:\Program Files\nodejs\node_modules\corepack\shims\pnpm.cmd'
& $pnpmShim --version
