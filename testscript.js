(function() {
    console.clear();
    console.log("%c🚀 STARTING HIGH-RES BATCH OPTIMIZATION (WITH KINEMATICS)...", "color: #2563eb; font-weight: bold; font-size: 14px;");

    // --- 1. CAPTURE UNCHANGED PARAMETERS ---
    const redBoxUnchanged = {
        "Foil Setup Mass (kg)": CONFIG.board_mass,
        "Wing AR": CONFIG.AR,
        "Drag Coeff (Cd0)": CONFIG.Cd0,
        "Stab Area (cm²)": (CONFIG.S_stab * 10000).toFixed(0),
        "Stab AR": CONFIG.AR_stab,
        "Stab Angle (°)": CONFIG.stab_angle,
        "Fuselage Length (m)": CONFIG.fuselage_len,
        "Rider Offset (m)": CONFIG.rider_offset
    };

    const greyBoxUnchanged = {
        "Swing Weight (%)": (CONFIG.swing_weight_ratio * 100).toFixed(0),
        "System Elasticity (%)": ((1.0 - CONFIG.elastic_efficiency) * 100).toFixed(0),
        "Added Mass Enabled": CONFIG.enable_added_mass
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
        CONFIG.mass = targetMass;
        CONFIG.S = targetAreaCm2 / 10000; // Convert cm² to m²
        CONFIG.U = targetSpeedKph / 3.6;  // Convert km/h to m/s

        const targetLift = (CONFIG.mass + CONFIG.board_mass) * CONFIG.g;
        const targetRiderWeight = CONFIG.mass * CONFIG.g;
        
        // 2. Limits are now used from the global 'limits' object captured above

        let bestCost = Infinity;
        let bestPower = Infinity;
        let bestNormPower = Infinity;
        let bestState = {};
        let bestValid = false;

        // 3. Evaluation Helper
        function evaluate(s) {
            // Set State
            state.freq = s.f;
            state.heave_amp = s.a;
            CONFIG.pitch_trim_deg = s.tr;
            CONFIG.asymmetry_factor = s.as;
            CONFIG.phase_shift_deg = s.ph;
            CONFIG.ride_height = s.h;

            // Run Simulation (Fast Integration)
            let sumLift = 0, sumThrust = 0, sumPower = 0, sumPower4 = 0, sumG = 0;
            const steps = 40; 
            const period = 1.0 / s.f;
            const dt = period / steps;

            for (let i = 0; i < steps; i++) {
                const phys = calculatePhysics(i * dt);
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

        // 4. Random Search (Exploration) - 200 iterations
        for (let i = 0; i < 200; i++) {
            const s = {
                f: locks.freq ? lockedVals.freq : (limits.freq.min + Math.random() * (limits.freq.max - limits.freq.min)),
                a: locks.amp ? lockedVals.amp : (limits.amp.min + Math.random() * (limits.amp.max - limits.amp.min)),
                tr: locks.trim ? lockedVals.trim : (limits.trim.min + Math.random() * (limits.trim.max - limits.trim.min)),
                as: locks.asym ? lockedVals.asym : (limits.asym.min + Math.random() * (limits.asym.max - limits.asym.min)),
                ph: locks.phase ? lockedVals.phase : (limits.phase.min + Math.random() * (limits.phase.max - limits.phase.min)),
                h: locks.height ? lockedVals.height : (limits.height.min + Math.random() * (limits.height.max - limits.height.min))
            };
            if (s.h < s.a + 0.02) {
                if (!locks.height) s.h = s.a + 0.05;
                else if (!locks.amp) s.a = Math.max(0.05, s.h - 0.05);
            }

            const res = evaluate(s);
            if (res.cost < bestCost) {
                bestCost = res.cost;
                bestPower = res.power;
                bestNormPower = res.normPower;
                bestState = s;
                bestValid = res.valid;
            }
        }

        // 5. Hill Climbing (Refinement) - 300 iterations
        for (let i = 0; i < 300; i++) {
            const scale = Math.max(0.05, 1.0 - (i / 300)); 
            const s = {
                f: locks.freq ? lockedVals.freq : (bestState.f + (Math.random() - 0.5) * 0.5 * scale),
                a: locks.amp ? lockedVals.amp : (bestState.a + (Math.random() - 0.5) * 0.1 * scale),
                tr: locks.trim ? lockedVals.trim : (bestState.tr + (Math.random() - 0.5) * 2.0 * scale),
                as: locks.asym ? lockedVals.asym : (bestState.as + (Math.random() - 0.5) * 0.2 * scale),
                ph: locks.phase ? lockedVals.phase : (bestState.ph + (Math.random() - 0.5) * 10.0 * scale),
                h: locks.height ? lockedVals.height : (bestState.h + (Math.random() - 0.5) * 0.1 * scale)
            };

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

            const res = evaluate(s);
            if (res.cost < bestCost) {
                bestCost = res.cost;
                bestPower = res.power;
                bestNormPower = res.normPower;
                bestState = s;
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
            "Optimal Height (m)": result.height.toFixed(2),
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
