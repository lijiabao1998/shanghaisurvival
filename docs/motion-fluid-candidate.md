# Motion fluidity candidate (not deployed)
Base: production e44d645. Keeps character meshes/sockets and separate character branch untouched.

The production attack froze movement for its entire duration, erased all leg stride during contact, used a fixed elbow bend, and switched walking poses abruptly. This candidate permits a collision-checked 38% speed combat step while retaining committed strike facing. Gait follows actual displacement (blocked walls no longer advance stride); visual gait accelerates/settles with a time-based exponential blend. Idle breathing uses an independent clock. Strikes retain 72% of supporting gait, initiate rotation through the torso, shift body weight sideways, and unfold the elbow from load to contact. Shoulder compensation still aligns weapon tip with the unchanged damage sweep.

Damage, range, active window, stamina cost, target-once hit rules, save schema, inventory and firearm data remain unchanged. Combat mobility is a deliberate gameplay feel change, not a claim of photorealistic animation. No model redesign is included.

Validation must include actual rendered continuous frames and actual HP reduction. Unit tests alone do not establish perceived smoothness. Software-rendered capture cadence must be reported as measured, not marketed as physical-device FPS. No merge or deployment is authorized by this candidate work.
