"""Compare CMAB attribute distributions across sample windows.

Answers one question: are the attributes informative enough to drive level
generation, or is every building effectively the same?

    .\\.venv\\Scripts\\python.exe tools\\attribute_report.py data\\samples\\probe_*.json

Output is deliberately ASCII: the Windows console here is not reliable for CJK.
"""
import argparse
import json
import math
from collections import Counter
from pathlib import Path

# CMAB marks missing categorical values with a single letter; treat a few
# spellings defensively rather than trusting one extract.
MISSING = {'', 'm', 'none', 'null', 'nan', 'na', 'n/a', '-', 'unknown'}


def clean(value):
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in MISSING else text


def shannon(counter, total):
    if total <= 0:
        return 0.0
    return -sum((c / total) * math.log2(c / total) for c in counter.values() if c)


def share(counter, total, key):
    return 100.0 * counter.get(key, 0) / total if total else 0.0


def describe(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    buildings = data.get('buildings', [])
    total = len(buildings)
    attrs = [(b.get('source_attributes') or {}) for b in buildings]

    functions = Counter(filter(None, (clean(a.get('Function')) for a in attrs)))
    structures = Counter(filter(None, (clean(a.get('Structure')) for a in attrs)))
    styles = Counter(filter(None, (clean(a.get('Style')) for a in attrs)))

    ages = []
    for a in attrs:
        value = clean(a.get('Age'))
        if value and value.replace('.0', '').isdigit():
            ages.append(int(float(value)))
    ages.sort()

    quality = []
    for a in attrs:
        value = clean(a.get('Quality'))
        if value is None:
            continue
        try:
            quality.append(float(value))
        except ValueError:
            continue
    quality.sort()

    def median(values):
        return values[len(values) // 2] if values else None

    def stdev(values):
        if len(values) < 2:
            return 0.0
        mean = sum(values) / len(values)
        return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))

    missing_fn = total - sum(functions.values())
    missing_age = total - len(ages)
    missing_q = total - len(quality)

    print(f"=== {Path(path).stem}  (n={total}) ===")
    if not total:
        print("  no buildings\n")
        return None
    print(f"  Function   modal {share(functions, sum(functions.values()), functions.most_common(1)[0][0]):5.1f}%"
          f"  distinct {len(functions)}  H={shannon(functions, sum(functions.values())):.2f} bits  missing {missing_fn}")
    for name, count in functions.most_common(5):
        print(f"               {name:<22} {100.0 * count / sum(functions.values()):5.1f}%")
    if ages:
        distinct = len(set(ages))
        top_age, top_n = Counter(ages).most_common(1)[0]
        print(f"  Age        {ages[0]}..{ages[-1]}  median {median(ages)}  distinct {distinct}"
              f"  top {top_age} ({100.0 * top_n / len(ages):.1f}%)  missing {missing_age}")
    else:
        print(f"  Age        no numeric values  missing {missing_age}")
    if quality:
        print(f"  Quality    {quality[0]:.3f}..{quality[-1]:.3f}  median {median(quality):.3f}"
              f"  sd {stdev(quality):.3f}  missing {missing_q}")
    else:
        print(f"  Quality    no numeric values  missing {missing_q}")
    for label, counter in (('Structure', structures), ('Style', styles)):
        if not counter:
            print(f"  {label:<10} all missing")
            continue
        parts = ' | '.join(f"{k} {100.0 * v / sum(counter.values()):.0f}%" for k, v in counter.most_common(4))
        print(f"  {label:<10} {parts}  (missing {total - sum(counter.values())})")

    usable = (share(functions, sum(functions.values()), functions.most_common(1)[0][0]) < 60.0
              and len(set(ages)) > max(3, total // 20))
    print(f"  verdict    {'informative' if usable else 'degenerate'}\n")
    return {
        'name': Path(path).stem, 'n': total,
        'function_modal': share(functions, sum(functions.values()), functions.most_common(1)[0][0]) if functions else 100.0,
        'function_distinct': len(functions),
        'age_distinct': len(set(ages)),
        'quality_sd': round(stdev(quality), 3),
        'usable': usable,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('samples', nargs='+', type=Path)
    args = ap.parse_args()
    rows = [describe(p) for p in args.samples]
    rows = [r for r in rows if r]
    if len(rows) < 2:
        return
    print(f"{'window':<28}{'n':>6}{' fn modal':>10}{' fn kinds':>10}{' age kinds':>11}{' q sd':>7}  verdict")
    for r in rows:
        print(f"{r['name']:<28}{r['n']:>6}{r['function_modal']:>9.1f}%{r['function_distinct']:>10}"
              f"{r['age_distinct']:>11}{r['quality_sd']:>7.2f}  {'informative' if r['usable'] else 'degenerate'}")


if __name__ == '__main__':
    main()
