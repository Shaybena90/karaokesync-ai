"""python -m vsearch [--host 127.0.0.1] [--port 8765]"""
import argparse

import uvicorn

from .api import create_app


def main():
    ap = argparse.ArgumentParser(description="video-search local service")
    ap.add_argument("--host", default="127.0.0.1", help="default: local machine only")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    uvicorn.run(create_app(), host=a.host, port=a.port)


if __name__ == "__main__":
    main()
