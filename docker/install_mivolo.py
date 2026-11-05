"""Installs the small "mivolo" package that the MiVOLO v2 model needs (its own code imports it) into the Docker image.

The package exists only on GitHub (not on PyPI) and its setup pins old versions of timm and ultralytics, so it is not installed with pip:
only its "mivolo" folder is copied (pinned to one commit), and three places that do not fit the current timm are adapted
(a function that was renamed, a function that moved, and a parameter that newer timm put in the middle of VOLO's list,
which shifted the values handed over by position). Nothing of the computation changes.
Run during the image build:  python docker/install_mivolo.py   (a second run changes nothing)."""
import io
import os
import re
import sys
import sysconfig
import urllib.request
import zipfile

COMMIT = "37475e3f8818b5f22448003feec3e64b01bfb188"
URL = "https://github.com/WildChlamydia/MiVOLO/archive/{}.zip".format(COMMIT)
VOLO_PARAMETERS = ["layers", "img_size", "in_chans", "num_classes", "global_pool", "patch_size", "stem_hidden_dim", "embed_dims", "num_heads",
                   "downsamples", "outlook_attention", "mlp_ratio", "qkv_bias", "drop_rate", "attn_drop_rate", "drop_path_rate", "norm_layer",
                   "post_layers", "use_aux_head", "use_mix_token", "pooling_scale"]


def download(root):
    """Copies the folder mivolo/ of the pinned commit into root. -> number of files."""
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL, timeout=120).read()))
    n = 0
    for name in z.namelist():
        rel = name.split("/", 1)[1] if "/" in name else ""
        if rel.startswith("mivolo/") and not name.endswith("/"):
            dest = os.path.join(root, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(z.read(name))
            n += 1
    return n


def _replace(text, old, new):
    return text.replace(old, new) if old in text else text


def patch(root):
    """Adapts the copied files to current timm. -> list of what was changed (empty when nothing was left to change)."""
    done = []
    path = os.path.join(root, "mivolo", "model", "create_timm_model.py")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new = _replace(text, "from timm.models._helpers import load_state_dict, remap_checkpoint",
                   "from timm.models._helpers import load_state_dict\ntry:\n    from timm.models._helpers import remap_checkpoint\nexcept ImportError:\n    from timm.models._helpers import remap_state_dict as remap_checkpoint")
    new = _replace(new, "from timm.models._pretrained import PretrainedCfg, split_model_name_tag",
                   "from timm.models._pretrained import PretrainedCfg\nfrom timm.models._registry import split_model_name_tag")
    if new != text:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        done.append("create_timm_model.py")
    path = os.path.join(root, "mivolo", "model", "mivolo_model.py")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"super\(\).__init__\(\n(?:\s+\w+,\n){%d}\s+\)" % len(VOLO_PARAMETERS), text)
    if m:
        text = text[:m.start()] + "super().__init__(\n" + "".join("            {0}={0},\n".format(n) for n in VOLO_PARAMETERS) + "        )" + text[m.end():]
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        done.append("mivolo_model.py")
    return done


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else sysconfig.get_paths()["purelib"]
    print("mivolo: copied {} files to {}".format(download(root), root))
    changed = patch(root)
    if "create_timm_model.py" not in changed or "mivolo_model.py" not in changed:
        sys.exit("mivolo: the downloaded files do not look as expected (changed: {}). Check the pinned commit.".format(changed or "nothing"))
    print("mivolo: adapted " + ", ".join(changed))


if __name__ == "__main__":
    main()
