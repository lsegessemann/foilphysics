(function() {
    console.clear();
    console.log("%c🚀 STARTING HIGH-RES BATCH OPTIMIZATION (WITH KINEMATICS)...", "color: #2563eb; font-weight: bold; font-size: 14px;");

    // --- 0. DEPENDENCY CHECK & ABSTRACTION ---
    if (typeof CONFIG === 'undefined' || typeof state === 'undefined' || typeof calculatePhysics === 'undefined') {
        console.error("❌ CRITICAL: Simulation globals (CONFIG, state, calculatePhysics) not found.");
        return;
    }

    // Abstraction layer to localize global dependencies
    const SIM = {
        config: CONFIG,
        state: state,
        calc: calculatePhysics
    };

    // --- 1. CAPTURE UNCHANGED PARAMETERS ---
    const redBoxUnchanged = {
        "Foil Setup Mass (kg)": SIM.config.board_mass,
        "Wing AR": SIM.config.AR,
        "Drag Coeff (Cd0)": SIM.config.Cd0,
        "Stab Area (cm²)": (SIM.config.S_stab * 10000).toFixed(0),
        "Stab AR": SIM.config.AR_stab,
        "Stab Angle (°)": SIM.config.stab_angle,
        "Fuselage Length (m)": SIM.config.fuselage_len,
        "Rider Offset (m)": SIM.config.rider_offset
    };

    const greyBoxUnchanged = {
        "Swing Weight (%)": (SIM.config.swing_weight_ratio * 100).toFixed(0),
        "System Elasticity (%)": ((1.0 - SIM.config.elastic_efficiency) * 100).toFixed(0),
        "Added Mass Enabled": SIM.config.enable_added_mass
    };

    console.log("\n%c--- UNCHANGED PARAMETERS (RED BOX) ---", "color: #d946ef; font-weight: bold;");
    console.table(redBoxUnchanged);

    console.log("%c--- UNCHANGED PARAMETERS (GREY BOX) ---", "color: #64748b; font-weight: bold;");
    console.table(greyBoxUnchanged);

    // --- 1.5 CAPTURE LOCKS & VALUES ---
    const locks = {
        freq: document.getElementById('lock-freq').checked,
        amp: document.getElementById('lock-amp').checked,
        trim: document.getElementById('lock-trim').checked,
        asym: document.getElementById('lock-asym').checked,
        phase: document.getElementById('lock-phase').checked,
        height: document.getElementById('lock-height').checked
    };

    const lockedVals = {
        freq: parseFloat(document.getElementById('in-freq').value),
        amp: parseFloat(document.getElementById('in-amp').value),
        trim: parseFloat(document.getElementById('in-trim').value),
        asym: parseFloat(document.getElementById('in-asym').value),
        phase: parseFloat(document.getElementById('in-phase').value),
        height: parseFloat(document.getElementById('in-height').value)
    };

    // --- 1.6 CAPTURE LIMITS FROM UI ---
    const limits = {
        freq: { min: parseFloat(document.getElementById('min-freq').value), max: parseFloat(document.getElementById('max-freq').value) },
        amp: { min: parseFloat(document.getElementById('min-amp').value), max: parseFloat(document.getElementById('max-amp').value) },
        trim: { min: parseFloat(document.getElementById('min-trim').value), max: parseFloat(document.getElementById('max-trim').value) },
        asym: { min: parseFloat(document.getElementById('min-asym').value), max: parseFloat(document.getElementById('max-asym').value) },
        phase: { min: parseFloat(document.getElementById('min-phase').value), max: parseFloat(document.getElementById('max-phase').value) },
        height: { min: parseFloat(document.getElementById('min-height').value), max: parseFloat(document.getElementById('max-height').value) }
    };

    console.log("%c--- OPTIMIZATION LIMITS ---", "color: #d97706; font-weight: bold;");
    const formattedLimits = {};
    for (const [k, v] of Object.entries(limits)) {
        if (locks[k]) {
            formattedLimits[k] = `🔒 LOCKED (${lockedVals[k]})`;
        } else {
            formattedLimits[k] = `${v.min} - ${v.max}`;
        }
    }
    console.table(formattedLimits);

    // --- 1.7 CAPTURE OPTIMIZATION METRIC ---
    const optMetric = document.getElementById('opt-metric') ? document.getElementById('opt-metric').value : 'avg';
    console.log(`%c   🎯 Optimizing for: ${optMetric === 'norm' ? 'NORMALIZED POWER' : 'AVERAGE POWER'}`, "color: #d97706; font-weight: bold;");

    // --- 2. DEFINE TEST CASES ---
    const combinations = [];
    const masses = [70, 80, 90];
    const areas = [1300, 2000];
    
    // Generate speeds from 12.0 to 20.0 in 0.5 steps
    const speeds = [];
    for (let s = 12.0; s <= 20.0; s += 0.5) {
        speeds.push(parseFloat(s.toFixed(1))); 
    }

    masses.forEach(mass => {
        areas.forEach(area => {
            speeds.forEach(speed => {
                combinations.push({ mass, area, speed });
            });
        });
    });

    // --- 3. OPTIMIZATION ENGINE ---
    function findOptimalSettings(targetMass, targetAreaCm2, targetSpeedKph) {
        // 1. Apply Configuration
        SIM.config.mass = targetMass;
        SIM.config.S = targetAreaCm2 / 10000; // Convert cm² to m²
        SIM.config.U = targetSpeedKph / 3.6;  // Convert km/h to m/s

        const targetLift = (SIM.config.mass + SIM.config.board_mass) * SIM.config.g;
        const targetRiderWeight = SIM.config.mass * SIM.config.g;
        
        // 2. Limits are now used from the global 'limits' object captured above

        let bestCost = Infinity;
        let bestPower = Infinity;
        let bestNormPower = Infinity;
        let bestState = {};
        let bestValid = false;

        // 3. Evaluation Helper
        function evaluate(s) {
            // Set State
            SIM.state.freq = s.f;
            SIM.state.heave_amp = s.a;
            SIM.config.pitch_trim_deg = s.tr;
            SIM.config.asymmetry_factor = s.as;
            SIM.config.phase_shift_deg = s.ph;
            SIM.config.riding_depth = s.h;

            // Run Simulation (Fast Integration)
            let sumLift = 0, sumThrust = 0, sumPower = 0, sumPower4 = 0, sumG = 0;
            
            // Adaptive Step Count (Improvement)
            const period = 1.0 / s.f;
            const maxDt = 0.02; // Ensure at least 50Hz sampling
            const steps = Math.ceil(period / maxDt);
            const dt = period / steps;

            for (let i = 0; i < steps; i++) {
                const phys = SIM.calc(i * dt);
                sumLift += phys.F_hydro_z;
                sumThrust += phys.thrust;
                sumPower += phys.power;
                sumPower4 += Math.pow(phys.power, 4);
                sumG += Math.abs(phys.W_apparent_z);
            }

            const avgLift = sumLift / steps;
            const avgThrust = sumThrust / steps;
            const avgPower = sumPower / steps;
            const normPower = Math.pow(sumPower4 / steps, 0.25);
            const avgG = sumG / steps;

            // Calculate Penalties (Soft Constraints)
            const liftErr = Math.abs(avgLift - targetLift);
            const thrustErr = Math.abs(avgThrust); 
            const gErr = Math.abs(avgG - targetRiderWeight);

            // Tolerances: Lift ±2N, Thrust ±1N, G ±5N
            const liftPen = Math.max(0, liftErr - 2.0);
            const thrustPen = Math.max(0, thrustErr - 1.0);
            const gPen = Math.max(0, gErr - 5.0);

            // Cost Function
            const metric = (optMetric === 'norm') ? normPower : avgPower;
            const cost = metric + 10000 * (liftPen + thrustPen + gPen);
            
            return { cost, power: avgPower, normPower, valid: (liftPen + thrustPen + gPen) < 0.001 };
        }

        // Helper: Constrain Parameters
        const constrain = (s) => {
            if (!locks.freq) s.f = Math.max(limits.freq.min, Math.min(limits.freq.max, s.f));
            if (!locks.amp) s.a = Math.max(limits.amp.min, Math.min(limits.amp.max, s.a));
            if (!locks.trim) s.tr = Math.max(limits.trim.min, Math.min(limits.trim.max, s.tr));
            if (!locks.asym) s.as = Math.max(limits.asym.min, Math.min(limits.asym.max, s.as));
            if (!locks.phase) s.ph = Math.max(limits.phase.min, Math.min(limits.phase.max, s.ph));
            if (!locks.height) s.h = Math.max(limits.height.min, Math.min(limits.height.max, s.h));

            if (s.h < s.a + 0.02) {
                if (!locks.height) s.h = s.a + 0.05;
                else if (!locks.amp) s.a = Math.max(0.05, s.h - 0.05);
            }
            return s;
        };

        // 4. Differential Evolution (Global Search) - 400 iterations
        // DE is much better at avoiding local minima than random search + hill climbing
        const popSize = 20;
        const generations = 20;
        let population = [];
        const paramKeys = ['f', 'a', 'tr', 'as', 'ph', 'h'];
        const limitMap = { f: 'freq', a: 'amp', tr: 'trim', as: 'asym', ph: 'phase', h: 'height' };

        // Initialize Population
        for (let i = 0; i < popSize; i++) {
            const s = {
                f: locks.freq ? lockedVals.freq : (limits.freq.min + Math.random() * (limits.freq.max - limits.freq.min)),
                a: locks.amp ? lockedVals.amp : (limits.amp.min + Math.random() * (limits.amp.max - limits.amp.min)),
                tr: locks.trim ? lockedVals.trim : (limits.trim.min + Math.random() * (limits.trim.max - limits.trim.min)),
                as: locks.asym ? lockedVals.asym : (limits.asym.min + Math.random() * (limits.asym.max - limits.asym.min)),
                ph: locks.phase ? lockedVals.phase : (limits.phase.min + Math.random() * (limits.phase.max - limits.phase.min)),
                h: locks.height ? lockedVals.height : (limits.height.min + Math.random() * (limits.height.max - limits.height.min))
            };
            const validS = constrain(s);
            const res = evaluate(validS);
            population.push({ s: validS, cost: res.cost });
            
            if (res.cost < bestCost) {
                bestCost = res.cost;
                bestPower = res.power;
                bestNormPower = res.normPower;
                bestState = { ...validS };
                bestValid = res.valid;
            }
        }

        // Evolution Loop
        for (let g = 0; g < generations; g++) {
            for (let i = 0; i < popSize; i++) {
                // Select 3 random distinct agents (a, b, c) != i
                let idxs = [];
                while (idxs.length < 3) {
                    let r = Math.floor(Math.random() * popSize);
                    if (r !== i && !idxs.includes(r)) idxs.push(r);
                }
                const a = population[idxs[0]].s;
                const b = population[idxs[1]].s;
                const c = population[idxs[2]].s;

                // Mutation & Crossover (DE/rand/1/bin)
                const trial = { ...population[i].s };
                const R = Math.floor(Math.random() * paramKeys.length); // Ensure at least one change
                
                paramKeys.forEach((key, idx) => {
                    if (locks[limitMap[key]]) return;
                    if (Math.random() < 0.9 || idx === R) { // CR = 0.9
                        trial[key] = a[key] + 0.7 * (b[key] - c[key]); // F = 0.7
                    }
                });

                const validTrial = constrain(trial);
                const res = evaluate(validTrial);

                // Selection
                if (res.cost < population[i].cost) {
                    population[i] = { s: validTrial, cost: res.cost };
                    if (res.cost < bestCost) {
                        bestCost = res.cost;
                        bestPower = res.power;
                        bestNormPower = res.normPower;
                        bestState = { ...validTrial };
                        bestValid = res.valid;
                    }
                }
            }
        }

        // 5. Final Polish (Local Search) - 100 iterations
        // Start from the best state found by DE to refine precision
        for (let i = 0; i < 100; i++) {
            const scale = Math.max(0.01, 0.2 * (1.0 - (i / 100))); // Small radius
            const s = {
                f: locks.freq ? lockedVals.freq : (bestState.f + (Math.random() - 0.5) * 0.5 * scale),
                a: locks.amp ? lockedVals.amp : (bestState.a + (Math.random() - 0.5) * 0.1 * scale),
                tr: locks.trim ? lockedVals.trim : (bestState.tr + (Math.random() - 0.5) * 2.0 * scale),
                as: locks.asym ? lockedVals.asym : (bestState.as + (Math.random() - 0.5) * 0.2 * scale),
                ph: locks.phase ? lockedVals.phase : (bestState.ph + (Math.random() - 0.5) * 10.0 * scale),
                h: locks.height ? lockedVals.height : (bestState.h + (Math.random() - 0.5) * 0.1 * scale)
            };

            const validS = constrain(s);
            const res = evaluate(validS);
            
            if (res.cost < bestCost) {
                bestCost = res.cost;
                bestPower = res.power;
                bestNormPower = res.normPower;
                bestState = { ...validS };
                bestValid = res.valid;
            }
        }

        return {
            power: bestPower,
            normPower: bestNormPower,
            freq: bestState.f,
            amp: bestState.a,
            trim: bestState.tr,
            asym: bestState.as,
            phase: bestState.ph,
            height: bestState.h,
            valid: bestValid
        };
    }

    // --- 4. EXECUTE BATCH ---
    const results = [];
    console.log("\n%c--- PROCESSING " + combinations.length + " COMBINATIONS ---", "color: #000; font-weight: bold;");
    
    combinations.forEach((c, idx) => {
        const progress = `[${idx + 1}/${combinations.length}]`;
        console.log(`${progress} Optimizing: ${c.mass}kg | ${c.area}cm² | ${c.speed}km/h ...`);
        
        const result = findOptimalSettings(c.mass, c.area, c.speed);
        
        results.push({
            "Mass (kg)": c.mass,
            "Wing Area (cm²)": c.area,
            "Speed (km/h)": c.speed,
            "Optimal Avg Power (W)": result.power.toFixed(1),
            "Optimal Norm Power (W)": result.normPower.toFixed(1),
            "Optimal Freq (Hz)": result.freq.toFixed(2),
            "Optimal Amp (m)": result.amp.toFixed(3),
            "Optimal Trim (°)": result.trim.toFixed(1),
            "Optimal Asym": result.asym.toFixed(2),
            "Optimal Phase (°)": result.phase.toFixed(0),
            "Optimal Depth (m)": result.height.toFixed(2),
            "Valid": result.valid
        });
    });

    // --- 5. OUTPUT CSV ---
    const headers = Object.keys(results[0]).join(",");
    const rows = results.map(r => Object.values(r).join(",")).join("\n");
    const csvContent = headers + "\n" + rows;

    console.log("\n%c--- FINAL CSV OUTPUT ---", "color: #166534; font-weight: bold; font-size: 14px;");
    console.log(csvContent);
    
    // --- 6. CONSOLE GRAPH ---
    // Helper: 2nd Degree Polynomial Regression (y = ax^2 + bx + c)
    function getPolyFit(points) {
        let n = points.length;
        if (n < 3) return null;
        let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
        let sy = 0, sxy = 0, sx2y = 0;
        for (let p of points) {
            let x = p.x; let y = p.y;
            let x2 = x*x;
            sx += x; sx2 += x2; sx3 += x2*x; sx4 += x2*x2;
            sy += y; sxy += x*y; sx2y += x2*y;
        }
        // Gaussian elimination for 3x3 matrix
        let m = [
            [n, sx, sx2, sy],
            [sx, sx2, sx3, sxy],
            [sx2, sx3, sx4, sx2y]
        ];
        for (let i = 0; i < 3; i++) {
            let pivot = m[i][i];
            for (let j = i + 1; j < 3; j++) {
                let factor = m[j][i] / pivot;
                for (let k = i; k < 4; k++) m[j][k] -= factor * m[i][k];
            }
        }
        let c = m[2][3] / m[2][2];
        let b = (m[1][3] - m[1][2]*c) / m[1][1];
        let a = (m[0][3] - m[0][2]*c - m[0][1]*b) / m[0][0];
        const fn = (x) => a + b*x + c*x*x;
        fn.coeffs = { a, b, c };
        return fn;
    }

    function drawConsoleGraph(title, valueKey) {
        const masses = [...new Set(results.map(r => r["Mass (kg)"]))].sort((a,b) => a-b);
        const areasGraph = [...new Set(results.map(r => r["Wing Area (cm²)"]))].sort((a,b) => a-b);
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']; 
        
        masses.forEach(mass => {
            console.log(`\n%c--- ${title} (${mass} kg) ---`, "color: #2563eb; font-weight: bold; font-size: 14px;");
            
            const massResults = results.filter(r => r["Mass (kg)"] == mass);
            
            const points = massResults.map(r => ({
                x: parseFloat(r["Speed (km/h)"]),
                y: parseFloat(r[valueKey])
            }));
            
            if (points.length <= 1) return;

            const minX = Math.min(...points.map(p => p.x));
            const maxX = Math.max(...points.map(p => p.x));
            const minY = Math.min(...points.map(p => p.y));
            const maxY = Math.max(...points.map(p => p.y));

            const W = 60;
            const H = 15;
            const grid = Array(H).fill().map(() => Array(W).fill(null));
            
            areasGraph.forEach((area, idx) => {
                const pts = massResults
                    .filter(r => r["Wing Area (cm²)"] == area)
                    .map(r => ({
                        x: parseFloat(r["Speed (km/h)"]),
                        y: parseFloat(r[valueKey]),
                        valid: r["Valid"]
                    }));
                
                pts.forEach(p => {
                    const nx = (p.x - minX) / (maxX - minX || 1);
                    const ny = (p.y - minY) / (maxY - minY || 1);
                    const c = Math.min(W - 1, Math.max(0, Math.round(nx * (W - 1))));
                    const r = Math.min(H - 1, Math.max(0, Math.round((1 - ny) * (H - 1))));
                    if (!grid[r][c]) grid[r][c] = [];
                    grid[r][c].push({ idx, valid: p.valid });
                });
            });

            console.log("%cLegend:", "font-weight:bold; color:#444");
            areasGraph.forEach((area, i) => {
                console.log(`%c● ${area} cm²`, `color: ${colors[i % colors.length]}; font-weight:bold`);
            });
            console.log(""); 

            for (let r = 0; r < H; r++) {
                const yVal = maxY - (r / (H - 1)) * (maxY - minY);
                let rowStr = `%c${yVal.toFixed(0).padStart(4)} ┤`;
                let rowStyles = ["color:#64748b"];
                
                let currentStyle = "";
                
                for (let c = 0; c < W; c++) {
                    const points = grid[r][c];
                    let char = " ";
                    let style = "color:inherit; background:none";
                    
                    if (points && points.length > 0) {
                        const unique = [...new Set(points.map(p => p.idx))].sort((a,b) => a-b);
                        if (unique.length === 1) {
                            const idx = unique[0];
                            const anyInvalid = points.some(x => !x.valid);
                            char = anyInvalid ? 'X' : '●';
                            style = `color: ${colors[idx % colors.length]}; background:none; font-weight:bold`;
                        } else {
                            const idx1 = unique[0];
                            const idx2 = unique[1];
                            const anyInvalid = points.some(x => !x.valid);
                            char = anyInvalid ? "X" : "▐";
                            style = `color: ${colors[idx2 % colors.length]}; background: ${colors[idx1 % colors.length]}; font-weight:bold`;
                        }
                    }
                    
                    if (style !== currentStyle) {
                        rowStr += "%c";
                        rowStyles.push(style);
                        currentStyle = style;
                    }
                    rowStr += char;
                }
                console.log(rowStr, ...rowStyles);
            }
            
            console.log(`%c     └${'─'.repeat(W)}`, "color:#64748b");
            
            let axisArr = Array(W).fill(' ');
            [12, 14, 16, 18, 20].forEach(val => {
                if (val >= minX && val <= maxX) {
                    const pos = Math.round(((val - minX) / (maxX - minX || 1)) * (W - 1));
                    const str = val.toString();
                    for(let i=0; i<str.length; i++) if(pos+i < W) axisArr[pos+i] = str[i];
                }
            });
            console.log(`%c      ${axisArr.join('')} km/h`, "color:#64748b; font-weight:bold");
        });
    }

    drawConsoleGraph("AVG POWER CURVES", "Optimal Avg Power (W)");
    drawConsoleGraph("NORMALIZED POWER CURVES", "Optimal Norm Power (W)");

    // Create Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.innerText = "📋 COPY CSV RESULTS";
    Object.assign(copyBtn.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000,
        padding: '12px 24px', background: '#2563eb', color: 'white',
        border: 'none', borderRadius: '8px', fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
        fontSize: '14px'
    });
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(csvContent);
        copyBtn.innerText = "✅ COPIED!";
        copyBtn.style.background = '#16a34a';
        setTimeout(() => copyBtn.remove(), 2000);
    };
    document.body.appendChild(copyBtn);

    // Restore UI
    document.getElementById('btn-reset').click();
    console.log("\n%cDone! Click the blue button to copy CSV.", "color: #666;");
})();
