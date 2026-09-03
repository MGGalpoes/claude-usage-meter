# Gera varias imagens editadas por referencia numa unica carga do modelo (Flux2 Klein 4B).
# Uso: gen_skin_batch.py --ref <foto.png> --tasks <tasks.json> --outdir <dir> [--seed N]
# tasks.json = {"nome": "prompt", ...}
import argparse, sys, time, shutil, json, os
from pathlib import Path
sys.path.insert(0, r"C:\Users\lukas\Wan2GP")
from shared.api import init
ap = argparse.ArgumentParser()
ap.add_argument("--ref", required=True); ap.add_argument("--tasks", required=True); ap.add_argument("--outdir", required=True)
ap.add_argument("--seed", type=int, default=7); ap.add_argument("--res", default="768x768"); ap.add_argument("--steps", type=int, default=4)
a = ap.parse_args()
tasks = json.load(open(a.tasks, encoding="utf8")); os.makedirs(a.outdir, exist_ok=True)
s = init(root=Path(r"C:\Users\lukas\Wan2GP"), cli_args=["--attention","sdpa","--profile","4"])
for name, prompt in tasks.items():
    t0=time.time(); print(f">>> {name}", flush=True)
    job=s.submit_task({"model_type":"flux2_klein_4b","prompt":prompt,"video_prompt_type":"I","image_refs":[a.ref],
        "resolution":a.res,"num_inference_steps":a.steps,"embedded_guidance_scale":1,"guidance_scale":1,"seed":a.seed,"batch_size":1})
    for ev in job.events.iter(timeout=1.0): pass
    r=job.result()
    if r.success:
        out=os.path.join(a.outdir, name+".png"); shutil.copy(r.generated_files[0], out); print(f"FILE: {out} ({int(time.time()-t0)}s)", flush=True)
    else:
        for e in r.errors: print("ERRO:", name, e.message, flush=True)
