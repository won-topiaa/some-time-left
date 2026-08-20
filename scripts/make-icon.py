"""
앱 아이콘을 만든다.

앱이 화면에서 쓰는 언어를 그대로 쓴다 — 종이빛 바탕 위에 걸어간 길 하나,
출발은 비어 있고 도착은 차 있다(`src/ui/RoutePreview.tsx`와 같은 규칙).
지도 앱처럼 보이지 않게 눈금도 핀도 두지 않는다.

    python3 scripts/make-icon.py

`assets/icon.png` (1024x1024)를 덮어쓴다. 값을 바꾸려면 아래 상수만 손대면 된다.
"""

from PIL import Image, ImageDraw

SIZE = 1024
SUPER = 4  # 계단을 없애려고 크게 그린 뒤 줄인다

BG = (250, 249, 246)  # colors.bg — 흰색보다 조금 따뜻한 종이빛
INK = (63, 90, 138)  # brand primaryColor #3F5A8A
SURFACE = (255, 255, 255)

# 길의 모양. 0~1 좌표로 두고 아래에서 캔버스 크기에 맞춘다.
#
# 오른쪽 위로 곧게 오르면 성장 그래프로 읽힌다. 이 앱이 권하는 건 그 반대다 —
# 최단 경로를 두고 일부러 돌아가는 길이라, 왼쪽으로 한 번 되돌아 나갔다가
# 도착점으로 올라온다. 아이콘만 봐도 "굽이도는 길"로 읽히게.
PATH = [
    (0.26, 0.74),
    (0.47, 0.75),
    (0.58, 0.61),
    (0.43, 0.49),
    (0.31, 0.39),
    (0.47, 0.27),
    (0.72, 0.26),
]


def smooth(points, steps=24):
    """
    꺾인 좌표열을 부드러운 곡선으로. Catmull-Rom.

    각진 지그재그는 번개나 부등호로 읽힌다. 이 앱의 톤은 조용한 편지에 가까워서
    길도 흐르듯 굽어야 한다.
    """
    pts = [points[0], *points, points[-1]]
    out = []
    for i in range(len(pts) - 3):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(
                (
                    0.5
                    * (
                        2 * p1[0]
                        + (-p0[0] + p2[0]) * t
                        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
                    ),
                    0.5
                    * (
                        2 * p1[1]
                        + (-p0[1] + p2[1]) * t
                        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
                    ),
                )
            )
    out.append(points[-1])
    return out


def draw_icon() -> Image.Image:
    n = SIZE * SUPER
    img = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(img)

    curve = smooth(PATH)
    pts = [(x * n, y * n) for x, y in curve]
    stroke = int(n * 0.055)

    # 리본. 촘촘한 점을 잇고 이음매마다 원을 얹어 선 끝이 각지지 않게 한다.
    d.line(pts, fill=INK, width=stroke, joint="curve")
    r = stroke / 2
    for x, y in pts:
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK)

    # 출발점 — 비어 있다.
    sx, sy = pts[0]
    outer = int(n * 0.044)
    ring = int(n * 0.014)
    d.ellipse([sx - outer, sy - outer, sx + outer, sy + outer], fill=INK)
    inner = outer - ring
    d.ellipse([sx - inner, sy - inner, sx + inner, sy + inner], fill=SURFACE)

    # 도착점 — 차 있다. 3분 전에 닿는 그 지점.
    ex, ey = pts[-1]
    er = int(n * 0.062)
    d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=INK)

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def write_proxy_copy(png_path: str) -> str:
    """
    프록시가 내보낼 수 있도록 base64로도 심어 둔다.

    `granite.config.ts`의 `brand.icon`은 파일 경로가 아니라 이미지 주소라
    어딘가에 HTTPS로 떠 있어야 한다. 이미 떠 있는 프록시가 함께 내보내면
    아이콘 하나 때문에 호스팅을 따로 둘 일이 없다.
    """
    import base64
    import os

    raw = open(png_path, "rb").read()
    b64 = base64.b64encode(raw).decode("ascii")
    lines = [b64[i : i + 96] for i in range(0, len(b64), 96)]
    body = "\n".join(f"  '{line}' +" for line in lines).rstrip(" +")

    out = os.path.join(os.path.dirname(__file__), "..", "proxy", "src", "icon-data.ts")
    open(out, "w", encoding="utf-8").write(
        "/**\n"
        " * 앱 아이콘을 base64로 품고 있는 파일. **손으로 고치지 않는다.**\n"
        " *\n"
        " * `python3 scripts/make-icon.py`가 그림과 함께 다시 만든다.\n"
        " *\n"
        " * 왜 여기 있나: `granite.config.ts`의 `brand.icon`은 파일 경로가 아니라\n"
        " * 이미지 **주소**다(프레임워크가 그대로 <Image source={{ uri }} />에 넘긴다).\n"
        " * 그래서 어딘가에 HTTPS로 떠 있어야 하는데, 이 프록시가 이미 떠 있으므로\n"
        " * 여기서 함께 내보낸다. 앱인토스 콘솔이 아이콘 호스팅을 제공하면 그 주소를 쓰고\n"
        " * 이 경로는 지워도 된다.\n"
        " */\n\n"
        f"/** {len(raw):,}바이트 PNG (1024x1024). */\n"
        "export const ICON_PNG_BASE64 =\n"
        f"{body};\n"
    )
    return os.path.normpath(out)


if __name__ == "__main__":
    import os

    out = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    icon = draw_icon()
    # 앱 아이콘에 알파가 있으면 스토어 검수에서 걸린다. RGB로만 저장한다.
    icon.save(out, "PNG", optimize=True)
    print(f"{os.path.normpath(out)} — {icon.size[0]}x{icon.size[1]}")

    # 그림을 바꾸면 프록시가 내보내는 것도 함께 바뀌어야 한다.
    print(f"{write_proxy_copy(out)} — 프록시용 base64 갱신")
    print("\n프록시를 다시 배포해야 새 아이콘이 보여요:  cd proxy && npm run deploy")
