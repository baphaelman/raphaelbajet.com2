"""The corpus: every Billboard Hot Rap Songs number one from Wikipedia's lists (1989-2019; Wikipedia has no
list for the 2020s), as songs.json [{song, artist, year}], year = the year it first reached number one.

    python3 tools/songs.py      # rewrites tools/songs.json
"""
import json, re, urllib.request, urllib.parse
from pathlib import Path

PAGES = ['List of Billboard number-one rap singles of the 1980s and 1990s',
         'List of Billboard number-one rap singles of the 2000s',
         'List of Billboard Hot Rap Songs number ones of the 2010s']


def wikitext(title):
    q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json', 'formatversion': 2, 'redirects': 1})
    req = urllib.request.Request('https://en.wikipedia.org/w/api.php?' + q, headers={'User-Agent': 'everything-rhymes (raphaelbajet.com)'})
    return json.load(urllib.request.urlopen(req))['parse']['wikitext']


def clean(s):
    s = re.sub(r'<ref[^>]*/>', '', s); s = re.sub(r'<ref.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{sortname\|([^|}]*)\|([^|}]*)(\|[^}]*)?\}\}', r'\1 \2', s)
    s = re.sub(r'\{\{(dagger|double-dagger|Anchor)[^}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'\{\{[^}]*\}\}', '', s)
    s = re.sub(r"''+", '', s)
    return re.sub(r'<[^>]+>', '', s).strip()


def rows(t):
    for row in t.split('\n|-'):
        m = re.search(r'\{\{dts\|(?:format=[a-z]+\|)?(\d{4})\|(\d+)\|(\d+)[^}]*\}\}', row, re.I)
        if not m:
            continue
        lines = [l for l in row.strip().split('\n') if l.strip()]
        for i, l in enumerate(lines):
            if '"' not in l:
                continue
            body = clean(re.sub(r'^[!|]\s*(?:scope="row"|bgcolor="[^"]*"|style="[^"]*")?\s*(?:rowspan="\d+"\s*)?\|?\s*', '', l))
            q = re.search(r'"(.+?)"', body)
            artist = clean(re.sub(r'^\|\s*', '', lines[i + 1])) if i + 1 < len(lines) else ''
            if q and artist and not artist.lower().startswith('{{dts'):
                yield q.group(1), artist, int(m.group(1))
            break


if __name__ == '__main__':
    out = {}
    for p in PAGES:
        for song, artist, year in rows(wikitext(p)):
            out.setdefault((song, artist), year)
    songs = sorted(({'song': s, 'artist': a, 'year': y} for (s, a), y in out.items()), key=lambda r: r['year'])
    Path(__file__).with_name('songs.json').write_text(json.dumps(songs, indent=1, ensure_ascii=False) + '\n')
    print(len(songs), 'songs')
