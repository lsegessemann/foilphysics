const btnRunBatch = document.getElementById('btn-run-batch');
if (btnRunBatch) {
    btnRunBatch.addEventListener('click', runBatchAnalysis);
}

async function runBatchAnalysis() {
    const btn = document.getElementById('btn-run-batch');
    btn.textContent = "RUNNING...";
    
    // Capture current state to restore after analysis
    const savedState = typeof captureCurrentState === 'function' ? captureCurrentState() : null;
    
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
        "Stab Area (cm²)": (SIM.config.S_stab * 10000).toFixed(0),
        "Stab AR": SIM.config.AR_stab,
        "Stab Angle (°)": SIM.config.stab_angle,
        "Fuselage Length (m)": SIM.config.fuselage_len,
        "Rider Offset (m)": SIM.config.rider_offset
    };

    const greyBoxUnchanged = {
        "Swing Weight (%)": (SIM.config.swing_weight_ratio * 100).toFixed(0),
        "System Elasticity (%)": ((1.0 - SIM.config.elastic_efficiency) * 100).toFixed(0)
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

    // --- 2. DEFINE TEST CASES (FROM UI) ---
    const p1Key = document.getElementById('batch-p1-sel').value;
    const p1Vals = [
        document.getElementById('batch-p1-v1').value,
        document.getElementById('batch-p1-v2').value,
        document.getElementById('batch-p1-v3').value
    ].filter(v => v.trim() !== "").map(parseFloat).filter(v => !isNaN(v));

    const p2Key = document.getElementById('batch-p2-sel').value;
    const p2Vals = [
        document.getElementById('batch-p2-v1').value,
        document.getElementById('batch-p2-v2').value,
        document.getElementById('batch-p2-v3').value
    ].filter(v => v.trim() !== "").map(parseFloat).filter(v => !isNaN(v));

    if (p1Vals.length === 0 || p2Vals.length === 0) {
        alert("Please enter at least one valid value for both Primary and Secondary parameters.");
        btn.textContent = "RUN BATCH ANALYSIS";
        return;
    }

    // Generate speeds from 12.0 to 25.0 in 1.0 steps
    const speeds = [];
    for (let s = 12.0; s <= 25.0; s += 1.0) {
        speeds.push(parseFloat(s.toFixed(1))); 
    }

    // Helper for Unit Conversion
    const applyParam = (key, val) => {
        if (key === 'S' || key === 'S_stab') SIM.config[key] = val / 10000;
        else SIM.config[key] = val;
    };

    // --- 3. OPTIMIZATION ENGINE ---
    function optimizeForSpeed(targetSpeedKph) {
        SIM.config.U = targetSpeedKph / 3.6;
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
    const totalSteps = p1Vals.length * p2Vals.length * speeds.length;
    let stepCount = 0;

    // Clear previous graphs
    const container = document.getElementById('batch-graphs-container');
    container.innerHTML = '';

    // --- DISPLAY CONSTANTS ---
    const paramDefs = [
        { key: 'mass', label: 'Rider Mass', unit: 'kg', fixed: 0 },
        { key: 'board_mass', label: 'Board Mass', unit: 'kg', fixed: 1 },
        { key: 'S', label: 'Wing Area', unit: 'cm²', scale: 10000, fixed: 0 },
        { key: 'AR', label: 'Wing AR', unit: '', fixed: 1 },
        { key: 'S_stab', label: 'Stab Area', unit: 'cm²', scale: 10000, fixed: 0 },
        { key: 'fuselage_len', label: 'Fuse Len', unit: 'm', fixed: 2 },
        { key: 'rider_offset', label: 'Offset', unit: 'm', fixed: 2 },
        { key: 'water_temp', label: 'Water Temp', unit: '°C', fixed: 0 },
        { key: 'stab_angle', label: 'Stab Angle', unit: '°', fixed: 1 },
        { key: 'AR_stab', label: 'Stab AR', unit: '', fixed: 1 }
    ];

    const constantParams = paramDefs.filter(p => p.key !== p1Key && p.key !== p2Key);

    const infoWrapper = document.createElement('div');
    infoWrapper.style.cssText = "width: 100%; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);";
    
    const infoTitle = document.createElement('div');
    infoTitle.textContent = "CONSTANT PARAMETERS";
    infoTitle.style.cssText = "font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;";
    infoWrapper.appendChild(infoTitle);

    const infoGrid = document.createElement('div');
    infoGrid.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; font-size: 11px; color: #334155;";
    
    constantParams.forEach(p => {
        let val = SIM.config[p.key];
        if (p.scale) val *= p.scale;
        const valStr = (p.fixed !== undefined) ? val.toFixed(p.fixed) : val;
        const item = document.createElement('div');
        item.style.cssText = "background: #f1f5f9; padding: 4px 8px; border-radius: 4px;";
        item.innerHTML = `<span style="color: #64748b; font-weight: 600;">${p.label}:</span> <span style="font-weight: bold; color: #0f172a;">${valStr}</span> ${p.unit}`;
        infoGrid.appendChild(item);
    });
    infoWrapper.appendChild(infoGrid);

    // --- DISPLAY OPTIMIZATION LIMITS ---
    const limitsTitle = document.createElement('div');
    limitsTitle.textContent = "OPTIMIZATION LIMITS";
    limitsTitle.style.cssText = "font-size: 10px; font-weight: bold; color: #d97706; margin-top: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px;";
    infoWrapper.appendChild(limitsTitle);

    const limitsGrid = document.createElement('div');
    limitsGrid.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; font-size: 11px; color: #334155;";

    const limitKeys = [
        { key: 'freq', label: 'Freq', unit: 'Hz' },
        { key: 'amp', label: 'Amp', unit: 'm' },
        { key: 'trim', label: 'Trim', unit: '°' },
        { key: 'asym', label: 'Asym', unit: '' },
        { key: 'phase', label: 'Phase', unit: '°' },
        { key: 'height', label: 'Depth', unit: 'm' }
    ];

    limitKeys.forEach(l => {
        const isLocked = locks[l.key];
        const range = limits[l.key];
        const val = lockedVals[l.key];
        
        const item = document.createElement('div');
        item.style.cssText = "background: #fff7ed; padding: 4px 8px; border-radius: 4px; border: 1px solid #ffedd5;";
        
        let content = `<span style="color: #9a3412; font-weight: 600;">${l.label}:</span> `;
        if (isLocked) {
             content += `<span style="font-weight: bold; color: #9a3412;">🔒 ${val.toFixed(2)}</span>`;
        } else {
             content += `<span style="font-weight: bold; color: #9a3412;">${range.min} - ${range.max}</span>`;
        }
        if (l.unit) content += ` <span style="color: #c2410c; font-size: 0.9em;">${l.unit}</span>`;
        
        item.innerHTML = content;
        limitsGrid.appendChild(item);
    });
    infoWrapper.appendChild(limitsGrid);
    container.appendChild(infoWrapper);

    const combineGraphs = document.getElementById('batch-combine-graphs') ? document.getElementById('batch-combine-graphs').checked : false;
    const combinedSeries = [];

    // Base colors for grouping (HSL)
    const baseHues = [221, 348, 142, 32, 271, 189, 330, 45]; // Blue, Red, Green, Orange, Purple, Cyan, Pink, Yellow

    // Iterate P1 (Outer - Graphs)
    for (let i1 = 0; i1 < p1Vals.length; i1++) {
        const v1 = p1Vals[i1];
        const graphData = {
            title: `${p1Key.toUpperCase()}: ${v1}`,
            series: []
        };

        // Iterate P2 (Inner - Lines)
        for (let i2 = 0; i2 < p2Vals.length; i2++) {
            const v2 = p2Vals[i2];
            const label = combineGraphs 
                ? `${p1Key}: ${v1} | ${p2Key}: ${v2}`
                : `${p2Key.toUpperCase()}: ${v2}`;
            
            let color = undefined;
            if (combineGraphs) {
                const hue = baseHues[i1 % baseHues.length];
                let lightness = 50;
                if (p2Vals.length > 1) {
                    // Spread lightness from 30% to 70%
                    lightness = 30 + (i2 / (p2Vals.length - 1)) * 40;
                }
                color = `hsl(${hue}, 80%, ${lightness}%)`;
            }

            const seriesData = { label: label, points: [], color: color };
            
            // Apply Params
            applyParam(p1Key, v1);
            applyParam(p2Key, v2);

            // Iterate Speeds
            for (let spd of speeds) {
                stepCount++;
                if (stepCount % 5 === 0) await new Promise(r => setTimeout(r, 0)); // Yield UI
                btn.textContent = `RUNNING ${Math.round(stepCount/totalSteps*100)}%`;

                const res = optimizeForSpeed(spd);
                results.push({
                    [p1Key]: v1,
                    [p2Key]: v2,
                    "Speed": spd,
                    "Power": res.power.toFixed(1),
                    "NormPower": res.normPower.toFixed(1),
                    "Freq": res.freq.toFixed(2),
                    "Amp": res.amp.toFixed(2),
                    "Trim": res.trim.toFixed(1),
                    "Asym": res.asym.toFixed(2),
                    "Phase": res.phase.toFixed(0),
                    "Depth": res.height.toFixed(2),
                    "Valid": res.valid ? "TRUE" : "FALSE"
                });
                if (res.valid) {
                    seriesData.points.push({ x: spd, y: res.power });
                }
            }
            graphData.series.push(seriesData);
            if (combineGraphs) combinedSeries.push(seriesData);
        }
        if (!combineGraphs) drawBatchGraph(container, graphData);
    }

    if (combineGraphs) {
        drawBatchGraph(container, {
            title: `Combined Analysis: ${p1Key.toUpperCase()} & ${p2Key.toUpperCase()}`,
            series: combinedSeries
        });
    }

    // --- 5. OUTPUT CSV ---
    if (results.length > 0) {
        const headers = Object.keys(results[0]).join(",");
        const rows = results.map(r => Object.values(r).join(",")).join("\n");
        const csvContent = headers + "\n" + rows;

        console.log("\n%c--- FINAL CSV OUTPUT ---", "color: #166534; font-weight: bold; font-size: 14px;");
        console.log(csvContent);

        // Create Download Button
        const btnExport = document.createElement('button');
        btnExport.textContent = "📥 DOWNLOAD CSV RESULTS";
        btnExport.style.cssText = "display: block; margin: 0 auto 20px auto; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;";
        btnExport.onclick = () => {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "batch_analysis.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        
        if (container.children.length > 0) {
            container.insertBefore(btnExport, container.children[1]);
        } else {
            container.appendChild(btnExport);
        }
    }
    
    // Restore original state
    if (savedState && typeof applyPresetState === 'function') {
        applyPresetState(savedState);
    }
    btn.textContent = "RUN BATCH ANALYSIS";
    
    // --- 6. GRAPHING HELPER ---
    function drawBatchGraph(container, data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-wrapper';
        wrapper.style.width = '100%';
        wrapper.style.marginBottom = '20px';
        
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 300;
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);
        
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const pad = 60;
        
        // Background
        ctx.fillStyle = "#fff"; ctx.fillRect(0,0,w,h);
        
        // Title
        ctx.fillStyle = "#333"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(data.title, w/2, 25);
        
        // Scales
        const allPoints = data.series.flatMap(s => s.points);
        if (allPoints.length === 0) return;
        
        const minX = 12.0; const maxX = 25.0;
        const minY = 0; const maxY = Math.max(...allPoints.map(p => p.y)) * 1.1;
        
        const mapX = (v) => pad + ((v - minX) / (maxX - minX)) * (w - 2*pad);
        const mapY = (v) => h - pad - (v / maxY) * (h - 2*pad);
        
        // Grid & Axes
        ctx.font = "12px sans-serif";
        ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
        ctx.beginPath();
        
        // X-Axis
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        for(let x=minX; x<=maxX; x+=1) { const px = mapX(x); ctx.moveTo(px, pad); ctx.lineTo(px, h-pad); ctx.fillText(x, px, h-pad+15); }

        // Y-Axis
        const yStep = Math.max(50, Math.ceil(maxY / 5 / 50) * 50);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for(let y=0; y<=maxY; y+=yStep) {
            const py = mapY(y);
            ctx.moveTo(pad, py); ctx.lineTo(w-pad, py);
            ctx.fillText(y, pad - 8, py);
        }
        ctx.stroke();
        
        // Series
        const colors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#4f46e5', '#ca8a04'];
        
        data.series.forEach((s, i) => {
            const color = s.color || colors[i % colors.length];
            ctx.fillStyle = color; ctx.strokeStyle = color;
            
            // Points
            s.points.forEach(p => {
                ctx.beginPath(); ctx.arc(mapX(p.x), mapY(p.y), 4, 0, Math.PI*2); ctx.fill();
            });
            
            // Connect points
            if (s.points.length > 1) {
                ctx.beginPath(); ctx.lineWidth = 2;
                s.points.forEach((p, idx) => {
                    const px = mapX(p.x); const py = mapY(p.y);
                    if (idx===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.stroke();
            }
            
            // Legend
            ctx.textAlign = "left"; ctx.font = "bold 12px sans-serif";
            ctx.fillText("● " + s.label, pad + 10, 40 + i*20);
        });
        
        // Axis Labels
        ctx.fillStyle = "#666"; ctx.textAlign = "center";
        ctx.fillText("Speed (km/h)", w/2, h - 5);
        ctx.save(); ctx.translate(15, h/2); ctx.rotate(-Math.PI/2);
        ctx.fillText("Power (W)", 0, 0);
        ctx.restore();
    }
}
