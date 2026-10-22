// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
    left: {x: -1, y: 0},
    right: {x: 1, y: 0},
    up: {x: 0, y: -1},
    down: {x: 0, y: 1},
};
const OPPOSITE = {left: 'right', right: 'left', up: 'down', down: 'up'};

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const POWER_TIME = 480;     // ~8s a 60fps
const FRIGHTENED_SPEED = 0.05;
const EATEN_SPEED = 0.2;
const RESPAWN_TIME = 600;   // 10s a 60fps

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
    const grid = MAZE.map((row) => row.slice());
    // La celda de inicio de Pacman arranca sin dot.
    grid[PACMAN_START.y][PACMAN_START.x] = 0;

    let dots = 0;
    for (const row of grid) for (const v of row) if (v === 2 || v === 4) dots++;

    return {
        state: 'start',
        score: 0,
        lives: 3,
        dotsRemaining: dots,
        powerTimer: 0,
        ghostCombo: 0,
        grid,
        pacman: {
            x: PACMAN_START.x,
            y: PACMAN_START.y,
            dir: 'left',
            nextDir: null,
            speed: PACMAN_SPEED,
        },
        ghosts: GHOST_STARTS.map((g) => ({
            x: g.x,
            y: g.y,
            dir: 'up',
            speed: GHOST_SPEED,
            kind: g.kind,
            releaseFrames: g.releaseFrames || 0,
            mode: 'normal',
            respawnTimer: 0,
        })),
    };
}

function aligned(v) {
    return Math.abs(v - Math.round(v)) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall(grid, x, y, actor) {
    if (y < 0 || y >= grid.length) return true;
    if (x < 0 || x >= grid[0].length) return true;
    const v = grid[y][x];
    if (v === 1) return true;
    if (v === 3 && actor === 'pacman') return true;
    return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove(grid, x, y, dir, actor) {
    const d = DIRS[dir];
    if (!d) return false;
    const tx = x + d.x;
    const ty = y + d.y;
    // Tunel: salir por un borde en la fila del tunel siempre es valido.
    if (ty === TUNNEL_ROW && (tx < 0 || tx >= grid[0].length)) return true;
    return !isWall(grid, tx, ty, actor);
}

function wrapTunnel(a, width) {
    if (Math.round(a.y) === TUNNEL_ROW) {
        if (a.x < 0) a.x += width;
        else if (a.x >= width) a.x -= width;
    }
}

function activatePower(game) {
    game.powerTimer = POWER_TIME;
    game.ghostCombo = 0;
    const grid = game.grid;
    game.ghosts.forEach((g) => {
        if (g.mode === 'eaten') return;
        g.mode = 'frightened';
        const opp = OPPOSITE[g.dir];
        if (opp && canMove(grid, Math.round(g.x), Math.round(g.y), opp, 'ghost')) {
            g.dir = opp;
        }
    });
}

function movePacman(game) {
    const p = game.pacman;
    const grid = game.grid;
    const width = grid[0].length;

    if (aligned(p.x) && aligned(p.y)) {
        p.x = Math.round(p.x);
        p.y = Math.round(p.y);

        // Aplicar giro pendiente si es posible.
        if (p.nextDir && canMove(grid, p.x, p.y, p.nextDir, 'pacman')) {
            p.dir = p.nextDir;
            p.nextDir = null;
        }
        // Comer dot o power pellet.
        const tile = grid[p.y][p.x];
        if (tile === 2) {
            grid[p.y][p.x] = 0;
            game.score += 10;
            game.dotsRemaining--;
        } else if (tile === 4) {
            grid[p.y][p.x] = 0;
            game.score += 50;
            game.dotsRemaining--;
            activatePower(game);
        }
        // Si no puede seguir, se detiene en la celda.
        if (!canMove(grid, p.x, p.y, p.dir, 'pacman')) return;
    }

    const d = DIRS[p.dir];
    p.x += d.x * p.speed;
    p.y += d.y * p.speed;
    wrapTunnel(p, width);
}

function inPen(g) {
    // Inclui a fileira da porta (12) para forcar a saida.
    return g.x >= 11 && g.x <= 16 && g.y >= 12 && g.y <= 15;
}

function distWrap(nx, ny, tx, ty, width) {
    let dx = Math.abs(nx - tx);
    if (ny === 14 && ty === 14) {
        dx = Math.min(dx, width - dx);
    }
    return dx + Math.abs(ny - ty);
}

function targetFor(game, g) {
    const p = game.pacman;
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    const width = game.grid[0].length;
    const height = game.grid.length;

    // Preso no pen: mirar a porta para sair.
    if (inPen(g)) {
        const tx = g.x < 13.5 ? 13 : 14;
        return {x: tx, y: 11};
    }

    if (g.kind === 'patrol') {
        const dist = Math.abs(g.x - px) + Math.abs(g.y - py);
        if (dist >= 8) return {x: px, y: py};
        return {x: 1, y: 29}; // canto inferior esquerdo (Clyde)
    }

    if (g.kind === 'chaser') {
        return {x: px, y: py};
    }

    if (g.kind === 'ambusher') {
        const dir = p.dir;
        const d = DIRS[dir] || {x: 0, y: 0};
        let tx = px + d.x * 4;
        let ty = py + d.y * 4;
        if (ty === 14) {
            tx = ((tx % width) + width) % width;
        } else {
            tx = Math.max(0, Math.min(width - 1, tx));
            ty = Math.max(0, Math.min(height - 1, ty));
        }
        return {x: tx, y: ty};
    }

    return {x: px, y: py};
}

function decideGhost(game, g) {
    const grid = game.grid;
    const width = grid[0].length;
    const p = game.pacman;
    const px = Math.round(p.x);
    const py = Math.round(p.y);

    const options = Object.keys(DIRS).filter(
        (dir) => dir !== OPPOSITE[g.dir] && canMove(grid, g.x, g.y, dir, 'ghost')
    );
    // Sin salida (callejon): permitir el giro de 180.
    const choices = options.length ? options : ['' + OPPOSITE[g.dir]];

    // Fantasma comido: olhos percorrem o labirinto aleatoriamente ate o timer vencer.
    // Nao podem entrar na jaula nem atravessar paredes.
    if (g.mode === 'eaten') {
        const outsidePen = choices.filter((dir) => {
            const d = DIRS[dir];
            const nx = g.x + d.x;
            const ny = g.y + d.y;
            return !(nx >= 11 && nx <= 16 && ny >= 12 && ny <= 15);
        });
        const opts = outsidePen.length ? outsidePen : choices;
        g.dir = opts[Math.floor(Math.random() * opts.length)];
        return;
    }

    // Fantasma asustado: huir (maximizar distancia).
    if (g.mode === 'frightened') {
        let best = choices[0];
        let bestDist = -Infinity;
        for (const dir of choices) {
            const d = DIRS[dir];
            const nx = g.x + d.x;
            const ny = g.y + d.y;
            const dist = distWrap(nx, ny, px, py, width);
            if (dist > bestDist) {
                bestDist = dist;
                best = dir;
            }
        }
        g.dir = best;
        return;
    }

    if (g.kind === 'random' && !inPen(g)) {
        g.dir = choices[Math.floor(Math.random() * choices.length)];
        return;
    }

    // Kinds com alvo: patrol, chaser, ambusher.
    const target = targetFor(game, g);
    let best = choices[0];
    let bestDist = Infinity;
    for (const dir of choices) {
        const d = DIRS[dir];
        const nx = g.x + d.x;
        const ny = g.y + d.y;
        const dist = distWrap(nx, ny, target.x, target.y, width);
        if (dist < bestDist) {
            bestDist = dist;
            best = dir;
        }
    }
    g.dir = best;
}

function moveGhost(game, g) {
    // Fantasma ainda preso no pen: nao move, apenas conta o tempo.
    if (g.releaseFrames > 0) {
        g.releaseFrames--;
        return;
    }
    const grid = game.grid;
    const width = grid[0].length;
    const speed = g.mode === 'frightened' ? FRIGHTENED_SPEED : g.mode === 'eaten' ? EATEN_SPEED : g.speed;

    if (aligned(g.x) && aligned(g.y)) {
        g.x = Math.round(g.x);
        g.y = Math.round(g.y);
        decideGhost(game, g);
        if (!canMove(grid, g.x, g.y, g.dir, 'ghost')) return;
    }

    const d = DIRS[g.dir];
    g.x += d.x * speed;
    g.y += d.y * speed;
    wrapTunnel(g, width);
}

function resetPositions(game) {
    const p = game.pacman;
    p.x = PACMAN_START.x;
    p.y = PACMAN_START.y;
    p.dir = 'left';
    p.nextDir = null;
    game.powerTimer = 0;
    game.ghostCombo = 0;
    game.ghosts.forEach((g, i) => {
        g.x = GHOST_STARTS[i].x;
        g.y = GHOST_STARTS[i].y;
        g.dir = 'up';
        g.releaseFrames = GHOST_STARTS[i].releaseFrames || 0;
        g.mode = 'normal';
        g.respawnTimer = 0;
    });
}

function collides(a, b) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function update(game) {
    movePacman(game);
    game.ghosts.forEach((g) => moveGhost(game, g));

    // Timer do power pellet.
    if (game.powerTimer > 0) {
        game.powerTimer--;
        if (game.powerTimer === 0) {
            game.ghosts.forEach((g) => {
                if (g.mode === 'frightened') g.mode = 'normal';
            });
        }
    }

    // Renascimento dos fantasmas comidos apos 10s.
    game.ghosts.forEach((g) => {
        if (g.mode !== 'eaten') return;
        if (g.respawnTimer > 0) g.respawnTimer--;
        if (g.respawnTimer === 0) {
            g.x = g.x < 13.5 ? 13 : 14;
            g.y = 14;
            g.dir = 'up';
            g.mode = game.powerTimer > 0 ? 'frightened' : 'normal';
        }
    });

    for (const g of game.ghosts) {
        if (collides(game.pacman, g)) {
            if (g.mode === 'frightened') {
                g.mode = 'eaten';
                g.respawnTimer = RESPAWN_TIME;
                game.score += 200 * Math.pow(2, game.ghostCombo);
                game.ghostCombo = Math.min(game.ghostCombo + 1, 3);
            } else if (g.mode === 'normal') {
                game.lives--;
                if (game.lives <= 0) {
                    game.state = 'lost';
                    return;
                }
                resetPositions(game);
                break;
            }
            // eaten: ignora
        }
    }

    if (game.dotsRemaining <= 0) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
