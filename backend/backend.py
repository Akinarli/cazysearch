"""
CAZySearch — Backend
CAZy veritabanı için arama ve NCBI protein detay proxy'si.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests, re, os, time, hashlib, json
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app, origins=["*"])

HEADERS = {
    "User-Agent": "CAZySearch/1.0 (research tool)",
    "Accept-Language": "en-US,en;q=0.9",
}

CACHE_DIR = os.environ.get("CACHE_DIR", "/tmp/cazysearch_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_TTL = 60 * 60 * 24 * 7  # 7 gün


def cache_get(key):
    path = os.path.join(CACHE_DIR, hashlib.md5(key.encode()).hexdigest() + ".json")
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
    path = os.path.join(CACHE_DIR, hashlib.md5(key.encode()).hexdigest() + ".json")
    try:
        with open(path, "w") as f:
            json.dump({"data": data, "ts": time.time()}, f)
    except Exception:
        pass


def fetch_html(url, ttl=None):
    cached = cache_get(url)
    if cached:
        return cached
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        html = r.text
        cache_set(url, html)
        return html
    except Exception as e:
        print(f"[WARN] fetch_html {url}: {e}")
        return None


# ─── ENDPOINTS ────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "app": "CAZySearch"})


@app.route("/search")
def search():
    """
    Organizma adına göre CAZy bakteri listesinde ara.
    ?q=Halomonas
    """
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify({"error": "En az 2 karakter girin"}), 400

    letter = q[0].upper()
    url = f"https://www.cazy.org/b{letter}.html"
    html = fetch_html(url)

    if not html:
        return jsonify({"error": "CAZy'ye bağlanılamadı"}), 502

    soup = BeautifulSoup(html, "html.parser")
    results = []

    for a in soup.find_all("a", href=re.compile(r"/b\d+\.html")):
        name = a.get_text(strip=True)
        if q.lower() in name.lower():
            href = a["href"]
            org_id = re.search(r"/b(\d+)\.html", href)
            if org_id:
                results.append({
                    "id": org_id.group(1),
                    "name": name,
                    "url": f"https://www.cazy.org{href}",
                })

    return jsonify({"query": q, "count": len(results), "results": results})


@app.route("/organism/<org_id>")
def organism(org_id):
    """
    Bir organizmanın CAZy protein listesini döndür.
    Family'ye göre gruplandırılmış.
    """
    if not re.match(r"^\d+$", org_id):
        return jsonify({"error": "Geçersiz ID"}), 400

    url = f"https://www.cazy.org/b{org_id}.html"
    html = fetch_html(url)
    if not html:
        return jsonify({"error": "CAZy'ye bağlanılamadı"}), 502

    soup = BeautifulSoup(html, "html.parser")

    # Organizma adı
    title = soup.find("h2") or soup.find("h1")
    org_name = title.get_text(strip=True) if title else f"Organism {org_id}"

    # Protein listesi tablosu: "List Of Proteins" başlığı altındaki tablo
    proteins = []
    list_header = soup.find(string=re.compile("List Of Proteins", re.I))
    if list_header:
        table = list_header.find_parent("table")
        if table:
            for row in table.find_all("tr")[1:]:
                cells = row.find_all("td")
                if len(cells) < 3:
                    continue
                name = cells[0].get_text(strip=True)
                family = cells[1].get_text(strip=True)
                acc_link = cells[2].find("a")
                accession = acc_link.get_text(strip=True) if acc_link else cells[2].get_text(strip=True)
                if name and family and accession:
                    proteins.append({
                        "name": name,
                        "family": family,
                        "accession": accession,
                    })

    # Family summary tabloları
    family_summary = {}
    for table in soup.find_all("table"):
        header = table.find("td")
        if not header:
            continue
        header_text = header.get_text(strip=True)
        ftype = None
        if "Glycoside Hydrolase" in header_text:
            ftype = "GH"
        elif "GlycosylTransferase" in header_text:
            ftype = "GT"
        elif "Polysaccharide Lyase" in header_text:
            ftype = "PL"
        elif "Carbohydrate Esterase" in header_text:
            ftype = "CE"
        elif "Carbohydrate-Binding Module" in header_text:
            ftype = "CBM"
        elif "Auxiliary Activit" in header_text:
            ftype = "AA"
        if ftype:
            rows = table.find_all("tr")
            if len(rows) >= 2:
                fam_nums = [a.get_text(strip=True) for a in rows[0].find_all("a")]
                fam_counts = [td.get_text(strip=True) for td in rows[1].find_all("td")]
                family_summary[ftype] = [
                    {"family": f"{ftype}{n}", "count": int(c) if c.isdigit() else 0}
                    for n, c in zip(fam_nums, fam_counts)
                ]

    return jsonify({
        "id": org_id,
        "name": org_name,
        "url": url,
        "protein_count": len(proteins),
        "family_summary": family_summary,
        "proteins": proteins,
    })


@app.route("/protein/<accession>")
def protein_detail(accession):
    """
    NCBI'dan protein detayı + GO annotation çek.
    """
    if not re.match(r"^[A-Z0-9_.]+$", accession):
        return jsonify({"error": "Geçersiz accession"}), 400

    url = f"https://www.ncbi.nlm.nih.gov/protein/{accession}?report=genbank&format=text"
    html = fetch_html(url)
    if not html:
        return jsonify({"error": "NCBI'ya bağlanılamadı"}), 502

    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text()

    result = {
        "accession": accession,
        "ncbi_url": f"https://www.ncbi.nlm.nih.gov/protein/{accession}",
        "product": "",
        "organism": "",
        "gene": "",
        "locus_tag": "",
        "ec_number": "",
        "go_function": [],
        "go_process": [],
        "go_component": [],
        "length": "",
    }

    # DEFINITION → product adı
    def_match = re.search(r"DEFINITION\s+(.+?)(?=\nACCESSION|\nVERSION)", text, re.DOTALL)
    if def_match:
        product = re.sub(r"\s+", " ", def_match.group(1)).strip()
        # [Organism] kısmını ayır
        bracket = re.search(r"\[(.+?)\]$", product)
        if bracket:
            result["organism"] = bracket.group(1)
            result["product"] = product[:bracket.start()].strip().rstrip(".")
        else:
            result["product"] = product

    # LOCUS → uzunluk
    locus_match = re.search(r"LOCUS\s+\S+\s+(\d+)\s+aa", text)
    if locus_match:
        result["length"] = locus_match.group(1) + " aa"

    # /gene=
    gene_match = re.search(r'/gene="([^"]+)"', text)
    if gene_match:
        result["gene"] = gene_match.group(1)

    # /locus_tag=
    locus_tag_match = re.search(r'/locus_tag="([^"]+)"', text)
    if locus_tag_match:
        result["locus_tag"] = locus_tag_match.group(1)

    # /EC_number=
    ec_match = re.search(r'/EC_number="([^"]+)"', text)
    if ec_match:
        result["ec_number"] = ec_match.group(1)

    # GO_function — tüm GO terimleri
    def parse_go(text, field):
        pattern = rf'/{field}="(.*?)"'
        entries = []
        for m in re.finditer(pattern, text, re.DOTALL):
            val = re.sub(r"\s+", " ", m.group(1)).strip()
            # "GO:XXXXXXX - desc [Evidence XXX]" formatını parse et
            go_match = re.search(r"(GO:\d+)\s*[-–]\s*(.+?)(?:\s*\[Evidence\s*(\w+)\])?$", val)
            if go_match:
                entries.append({
                    "go_id": go_match.group(1),
                    "description": go_match.group(2).strip(),
                    "evidence": go_match.group(3) or "",
                })
            else:
                entries.append({"go_id": "", "description": val, "evidence": ""})
        return entries

    result["go_function"] = parse_go(text, "GO_function")
    result["go_process"] = parse_go(text, "GO_process")
    result["go_component"] = parse_go(text, "GO_component")

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5052))
    print(f"CAZySearch backend http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
