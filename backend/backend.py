"""CAZySearch Backend"""
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests, re, os, time, hashlib, json
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

HEADERS = {"User-Agent": "CAZySearch/1.0 (research tool)"}
CACHE_DIR = os.environ.get("CACHE_DIR", "/tmp/cazysearch_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_TTL = 60 * 60 * 24 * 7

# ── Cache ──────────────────────────────────────────────────────────────────

def _cache_path(key):
    return os.path.join(CACHE_DIR, hashlib.md5(key.encode()).hexdigest() + ".json")

def cache_get(key):
    path = _cache_path(key)
    if os.path.exists(path):
        try:
            with open(path) as f:
                entry = json.load(f)
            if time.time() - entry["ts"] < CACHE_TTL:
                return entry["data"]
        except Exception:
            pass
    return None

def cache_set(key, data):
    path = _cache_path(key)
    try:
        with open(path, "w") as f:
            json.dump({"data": data, "ts": time.time()}, f)
    except Exception:
        pass

def fetch_url(url, timeout=30):
    cached = cache_get(url)
    if cached is not None:
        return cached
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        cache_set(url, r.text)
        return r.text
    except Exception as e:
        print(f"[WARN] {url}: {e}")
        return None

# ── CAZy protein tablosu parser ────────────────────────────────────────────
# CAZy HTML yapısı: "List Of Proteins" başlıklı bölüm altında
# | Protein Name | Family | Reference Accession |
# şeklinde bir tablo var. Header bazen <th>, bazen <td class="col_header"> oluyor.

def _parse_proteins_from_soup(soup, seen=None):
    """soup'tan protein listesini çıkarır. seen: duplicate önleme seti."""
    if seen is None:
        seen = set()
    proteins = []

    # Yöntem 1: "List Of Proteins" yazısını içeren element'i bul
    # CAZy'de bu genellikle bir <span> veya <b> içinde geçiyor
    for tag in soup.find_all(["span", "b", "h3", "h2", "div", "td"]):
        txt = tag.get_text(strip=True)
        if "List Of Proteins" in txt or "list of proteins" in txt.lower():
            # Bu tag'in parent table'ını veya sonraki tabloyu bul
            parent_table = tag.find_parent("table")
            if parent_table:
                _extract_from_table(parent_table, proteins, seen)
                if proteins:
                    return proteins
            # Sonraki kardeş table
            nxt = tag.find_next("table")
            if nxt:
                _extract_from_table(nxt, proteins, seen)
                if proteins:
                    return proteins

    # Yöntem 2: Tüm tablolara bak, "Protein Name" + "Family" başlıklı olanı al
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_text = " ".join(c.get_text(strip=True).lower()
                               for c in rows[0].find_all(["th", "td"]))
        if "protein" in header_text and "family" in header_text:
            _extract_from_table(table, proteins, seen)
            if proteins:
                return proteins

    # Yöntem 3: Accession linklerini tara (APE, WP_, CAA vb. formatları)
    acc_pattern = re.compile(r"^[A-Z]{2,3}\d{5,}\.\d$|^WP_\d+\.\d$|^[A-Z]{1,3}\d+\.\d$")
    for a in soup.find_all("a"):
        href = a.get("href", "")
        acc  = a.get_text(strip=True)
        if not acc_pattern.match(acc):
            continue
        if acc in seen:
            continue
        # Aynı satırdaki hücreleri al
        row = a.find_parent("tr")
        if not row:
            continue
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        name   = cells[0].get_text(strip=True)
        family = cells[1].get_text(strip=True)
        if name and family:
            seen.add(acc)
            proteins.append({"name": name, "family": family, "accession": acc})

    return proteins


def _extract_from_table(table, proteins, seen):
    """Table'dan protein satırlarını çıkarır."""
    rows = table.find_all("tr")
    for row in rows[1:]:  # header'ı atla
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        name      = cells[0].get_text(strip=True)
        family    = cells[1].get_text(strip=True)
        acc_link  = cells[2].find("a")
        accession = acc_link.get_text(strip=True) if acc_link else cells[2].get_text(strip=True)
        accession = accession.strip()
        if name and family and accession and accession not in seen:
            # Geçersiz accession'ları filtrele
            if re.match(r"^[A-Z0-9_.]+$", accession) and len(accession) > 3:
                seen.add(accession)
                proteins.append({"name": name, "family": family, "accession": accession})


def _get_all_proteins(org_id):
    """
    Organizmanın TÜM proteinlerini çek.
    1. _all.html dene (pagination yok, tüm liste)
    2. Yoksa normal .html + debut_PRINC pagination
    """
    seen     = set()
    proteins = []

    # 1. _all.html — CAZy bu URL'de tüm listeyi tek sayfada verebilir
    all_html = fetch_url(f"https://www.cazy.org/b{org_id}_all.html")
    if all_html:
        soup = BeautifulSoup(all_html, "html.parser")
        proteins = _parse_proteins_from_soup(soup, seen)
        del soup, all_html
        if proteins:
            print(f"[INFO] {org_id}: {len(proteins)} proteins from _all.html")
            return proteins

    # 2. Normal sayfa + pagination
    offset = 0
    step   = 100
    while True:
        if offset == 0:
            url = f"https://www.cazy.org/b{org_id}.html"
        else:
            url = f"https://www.cazy.org/b{org_id}.html?debut_PRINC={offset}#pagination_PRINC"

        html = fetch_url(url)
        if not html:
            break

        soup   = BeautifulSoup(html, "html.parser")
        before = len(proteins)
        _parse_proteins_from_soup(soup, seen)
        # seen/proteins güncel — parse içinde eklendi
        # ama parse ayrı liste döndürüyor, burada topluyoruz
        new_batch = _parse_proteins_from_soup(BeautifulSoup(html, "html.parser"), set(seen))
        # Tekrara düşmemek için seen kontrolü
        for p in new_batch:
            if p["accession"] not in seen:
                seen.add(p["accession"])
                proteins.append(p)
        after = len(proteins)
        del soup, html

        print(f"[INFO] {org_id} offset={offset}: +{after - before} proteins (total {after})")

        if after == before:
            break
        if (after - before) < step:
            break
        offset += step

    return proteins

# ── NCBI protein çekici ────────────────────────────────────────────────────

def _fetch_ncbi(accession):
    cache_key = f"ncbi:{accession}"
    cached    = cache_get(cache_key)
    if cached is not None:
        return cached

    result = {
        "accession": accession,
        "ncbi_url":  f"https://www.ncbi.nlm.nih.gov/protein/{accession}",
        "product": "", "organism": "", "gene": "",
        "locus_tag": "", "ec_number": "",
        "go_function": [], "go_process": [], "go_component": [],
        "length": ""
    }

    url = (
        f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        f"?db=protein&id={accession}&rettype=gp&retmode=text"
    )

    text = None
    for _ in range(2):
        try:
            r = requests.get(url, headers=HEADERS, timeout=45)
            r.raise_for_status()
            text = r.text
            if len(text) > 100:
                break
        except Exception as e:
            print(f"[WARN] NCBI {accession}: {e}")
        time.sleep(1)

    if not text or len(text) < 100:
        cache_set(cache_key, result)
        return result

    m = re.search(r"DEFINITION\s+(.+?)(?=\nACCESSION|\nVERSION)", text, re.DOTALL)
    if m:
        product = re.sub(r"\s+", " ", m.group(1)).strip()
        bracket = re.search(r"\[(.+?)\]$", product)
        if bracket:
            result["organism"] = bracket.group(1)
            result["product"]  = product[:bracket.start()].strip().rstrip(".")
        else:
            result["product"] = product

    if not result["product"]:
        m = re.search(r'/product="([^"]+)"', text)
        if m:
            result["product"] = m.group(1)

    if not result["organism"]:
        m = re.search(r'/organism="([^"]+)"', text)
        if m:
            result["organism"] = m.group(1)

    m = re.search(r"LOCUS\s+\S+\s+(\d+)\s+aa", text)
    if m:
        result["length"] = m.group(1) + " aa"

    for pat, key in [
        (r'/gene="([^"]+)"',       "gene"),
        (r'/locus_tag="([^"]+)"',  "locus_tag"),
        (r'/EC_number="([^"]+)"',  "ec_number"),
    ]:
        m = re.search(pat, text)
        if m:
            result[key] = m.group(1)

    def parse_go(txt, field):
        entries = []
        for m in re.finditer('/' + field + '="(.*?)"', txt, re.DOTALL):
            val = re.sub(r"\s+", " ", m.group(1)).strip()
            gm  = re.search(r"(GO:\d+)\s*[-]\s*(.+?)(?:\s*\[Evidence\s*(\w+)\])?$", val)
            if gm:
                entries.append({"go_id": gm.group(1),
                                 "description": gm.group(2).strip(),
                                 "evidence":    gm.group(3) or ""})
            else:
                entries.append({"go_id": "", "description": val, "evidence": ""})
        return entries

    result["go_function"]  = parse_go(text, "GO_function")
    result["go_process"]   = parse_go(text, "GO_process")
    result["go_component"] = parse_go(text, "GO_component")

    cache_set(cache_key, result)
    del text
    return result

# ── Endpoint'ler ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return jsonify({"status": "ok", "app": "CAZySearch"})

@app.route("/health")
def health():
    return jsonify({"status": "ok", "app": "CAZySearch"})

@app.route("/search")
def search():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify({"error": "En az 2 karakter"}), 400
    html = fetch_url(f"https://www.cazy.org/b{q[0].upper()}.html")
    if not html:
        return jsonify({"error": "CAZy bağlantı hatası"}), 502
    soup    = BeautifulSoup(html, "html.parser")
    results = []
    for a in soup.find_all("a", href=re.compile(r"/b\d+\.html")):
        name = a.get_text(strip=True)
        if q.lower() in name.lower():
            m = re.search(r"/b(\d+)\.html", a["href"])
            if m:
                href = a["href"]
                url  = href if href.startswith("http") else "https://www.cazy.org" + href
                results.append({"id": m.group(1), "name": name, "url": url})
    del soup, html
    return jsonify({"query": q, "count": len(results), "results": results})

@app.route("/organism/<org_id>")
def organism(org_id):
    if not re.match(r"^\d+$", org_id):
        return jsonify({"error": "Gecersiz ID"}), 400

    html = fetch_url(f"https://www.cazy.org/b{org_id}.html")
    if not html:
        return jsonify({"error": "CAZy bağlantı hatası"}), 502

    soup     = BeautifulSoup(html, "html.parser")
    title    = soup.find("h2") or soup.find("h1")
    org_name = title.get_text(strip=True) if title else f"Organism {org_id}"

    # Family summary
    family_summary = {}
    for table in soup.find_all("table"):
        header = table.find("td")
        if not header:
            continue
        ht    = header.get_text(strip=True)
        ftype = None
        if "Glycoside Hydrolase"    in ht: ftype = "GH"
        elif "GlycosylTransferase"  in ht: ftype = "GT"
        elif "Polysaccharide Lyase" in ht: ftype = "PL"
        elif "Carbohydrate Esterase" in ht: ftype = "CE"
        elif "Carbohydrate-Binding" in ht: ftype = "CBM"
        elif "Auxiliary Activit"    in ht: ftype = "AA"
        if ftype:
            rows = table.find_all("tr")
            if len(rows) >= 2:
                nums   = [a.get_text(strip=True) for a in rows[0].find_all("a")]
                counts = [td.get_text(strip=True) for td in rows[1].find_all("td")]
                family_summary[ftype] = [
                    {"family": f"{ftype}{n}", "count": int(c) if c.isdigit() else 0}
                    for n, c in zip(nums, counts)
                ]
    del soup, html

    proteins = _get_all_proteins(org_id)
    return jsonify({"id": org_id, "name": org_name,
                    "url": f"https://www.cazy.org/b{org_id}.html",
                    "protein_count": len(proteins),
                    "family_summary": family_summary, "proteins": proteins})

@app.route("/protein/<accession>")
def protein_detail(accession):
    if not re.match(r"^[A-Z0-9_.]+$", accession):
        return jsonify({"error": "Gecersiz accession"}), 400
    return jsonify(_fetch_ncbi(accession))

# ── SSE: sırayla protein tara ─────────────────────────────────────────────

@app.route("/scan/<org_id>")
def scan(org_id):
    if not re.match(r"^\d+$", org_id):
        return Response('data: {"error":"Gecersiz ID"}\n\n',
                        mimetype="text/event-stream")

    def generate():
        proteins = _get_all_proteins(org_id)
        total    = len(proteins)

        yield f'data: {json.dumps({"total": total, "started": True})}\n\n'

        for i, p in enumerate(proteins):
            ncbi    = _fetch_ncbi(p["accession"])
            payload = {
                "index":     i,
                "total":     total,
                "accession": p["accession"],
                "family":    p["family"],
                "cazy_name": p["name"],
                **ncbi,
            }
            yield f'data: {json.dumps(payload, ensure_ascii=False)}\n\n'
            del ncbi, payload
            time.sleep(0.05)

        yield f'data: {json.dumps({"done": True, "total": total})}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5052))
    app.run(host="0.0.0.0", port=port, debug=False)
