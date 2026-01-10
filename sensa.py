import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
from scipy.optimize import root
from dataclasses import dataclass
import warnings

warnings.filterwarnings('ignore')

# --- 1. PHYSICS ENGINE ---
@dataclass
class SimParams:
    mass: float       # kg
    speed_kmh: float  # km/h
    wing_area_cm2: float # cm2
    freq: float       # Hz
    heave_amp: float = 0.15 
    pitch_trim_deg: float = 0.0 
    ar: float = 13.9
    cd0: float = 0.015
    swing_ratio: float = 0.4
    efficiency: float = 0.7
    phase_shift_deg: float = 90.0
    asymmetry: float = 0.0

def simulate_cycle(p: SimParams, n_steps=30):
    U = p.speed_kmh / 3.6
    S = p.wing_area_cm2 / 10000.0
    omega = 2 * np.pi * p.freq
    g = 9.81
    rho = 1000.0
    
    m_moving = 8.0 + (p.mass * p.swing_ratio)
    t_vals = np.linspace(0, 1/p.freq, n_steps)
    
    pitch_trim_rad = np.radians(p.pitch_trim_deg)
    phase_rad = np.radians(p.phase_shift_deg)
    
    vz_max = p.heave_amp * omega
    gamma_max = np.arctan2(vz_max, U)
    pitch_amp = gamma_max * 0.90
    
    lifts, thrusts, powers = [], [], []
    
    for t in t_vals:
        phi = omega * t
        # Time warping: psi = phi - C * cos(phi) creates Quick Down / Slow Up for C > 0
        psi = phi - p.asymmetry * np.cos(phi)
        dpsi = omega * (1 + p.asymmetry * np.sin(phi))
        ddpsi = (omega**2) * p.asymmetry * np.cos(phi)
        
        z = p.heave_amp * np.cos(psi)
        vz = -p.heave_amp * np.sin(psi) * dpsi
        az = -p.heave_amp * (np.cos(psi) * (dpsi**2) + np.sin(psi) * ddpsi)
        theta = pitch_trim_rad + pitch_amp * np.cos(psi + phase_rad)
        
        vx = U
        gamma = np.arctan2(vz, vx)
        alpha = theta - gamma
        v_sq = vx**2 + vz**2
        
        Cl = (2 * np.pi * alpha) / (1 + 2 / p.ar)
        k = 1 / (np.pi * p.ar)
        Cd = p.cd0 + k * (Cl**2)
        
        L_mag = 0.5 * rho * S * Cl * v_sq
        D_mag = 0.5 * rho * S * Cd * v_sq
        
        Lz = L_mag * np.cos(gamma)
        Lx = -L_mag * np.sin(gamma)
        Dz = -D_mag * np.sin(gamma)
        Dx = -D_mag * np.cos(gamma)
        
        F_inertia = m_moving * (g + az)
        F_rider = max(0, (Lz + Dz) - F_inertia)
        
        raw_power = F_rider * (-vz) if vz < 0 else 0
        power = max(0, raw_power * p.efficiency)
        
        lifts.append(Lz + Dz)
        thrusts.append(Lx + Dx)
        powers.append(power)
        
    return np.mean(lifts), np.mean(thrusts), np.mean(powers)

def solve_equilibrium(speed, mass, freq):
    # Fixed Wing Area for this comparison to match your plots
    area = 1500 
    target_lift = mass * 9.81
    
    p = SimParams(mass=mass, speed_kmh=speed, wing_area_cm2=area, freq=freq)
    
    def objective(vars):
        trim, amp = vars
        if amp <= 0.01 or amp > 0.45: return [1e3, 1e3]
        p.pitch_trim_deg = trim
        p.heave_amp = amp
        l, t, pow = simulate_cycle(p)
        return [l - target_lift, t] # Target 0 thrust

    sol = root(objective, [2.0, 0.15], method='lm')
    
    if sol.success:
        opt_trim, opt_amp = sol.x
        if 0.05 < opt_amp < 0.4 and abs(opt_trim) < 15:
            p.pitch_trim_deg = opt_trim
            p.heave_amp = opt_amp
            l, t, pow = simulate_cycle(p)
            return {
                "Mass (kg)": mass,
                "Speed (km/h)": speed,
                "Freq (Hz)": freq,
                "Trim (°)": opt_trim,
                "Amp (m)": opt_amp,
                "Power (W)": pow,
                "Efficiency (W/kg)": pow / mass
            }
    return None

# --- 2. GENERATE DATA ---
speeds = [14, 16, 18, 20]
masses = [70, 85, 100]
freqs = [1.2, 1.3, 1.4, 1.5, 1.6]

data = []
for m in masses:
    for s in speeds:
        for f in freqs:
            res = solve_equilibrium(s, m, f)
            if res: data.append(res)

df = pd.DataFrame(data)

# --- 3. CREATE PLOTS ---
sns.set_theme(style="whitegrid")

# Plot 1: Power vs Speed by Mass
plt.figure(figsize=(10, 6))
sns.scatterplot(data=df, x="Speed (km/h)", y="Power (W)", hue="Mass (kg)", palette="viridis", s=100)
plt.title("Power (W) vs Speed (km/h) by Mass (kg)")
plt.savefig('power_speed_mass.png')
plt.close()

# Plot 2: Efficiency vs Freq by Speed
plt.figure(figsize=(10, 6))
sns.scatterplot(data=df, x="Freq (Hz)", y="Efficiency (W/kg)", hue="Speed (km/h)", palette="coolwarm", s=100)
plt.title("Efficiency (W/kg) vs Frequency (Hz) by Speed (km/h)")
plt.savefig('efficiency_freq_speed.png')
plt.close()

# Plot 3: Amplitude vs Freq by Power
plt.figure(figsize=(10, 6))
sns.scatterplot(data=df, x="Freq (Hz)", y="Amp (m)", hue="Power (W)", palette="magma", s=100)
plt.title("Amplitude (m) vs Frequency (Hz) by Power (W)")
plt.savefig('amp_freq_power.png')
plt.close()

# Plot 4: Correlation Matrix
plt.figure(figsize=(10, 8))
corr = df.corr()
sns.heatmap(corr, annot=True, cmap="coolwarm", fmt=".2f", linewidths=.5)
plt.title("Correlation Matrix of Variables")
plt.savefig('correlation_matrix.png')
plt.close()

# Plot 5: Pairplot
sns.pairplot(df, diag_kind="kde", corner=False)
plt.savefig('pairplot.png')
plt.close()