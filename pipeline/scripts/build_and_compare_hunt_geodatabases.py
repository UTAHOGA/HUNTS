#!/usr/bin/env python3
import argparse
import hashlib
import re
import sqlite3
from pathlib import Path

SYSTEM_TABLE_PREFIXES = ("sqlite_", "gpkg", "rtree_", "idx_")


def safe_name(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", text)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned.lower() or "unnamed"


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def list_user_tables(conn: sqlite3.Connection):
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        ORDER BY name
        """
    ).fetchall()
    out = []
    for (name,) in rows:
        if name.startswith(SYSTEM_TABLE_PREFIXES):
            continue
        out.append(name)
    return out


def table_columns(conn: sqlite3.Connection, table_name: str):
    q = f"PRAGMA table_info({quote_ident(table_name)})"
    try:
        return [row[1] for row in conn.execute(q).fetchall()]
    except sqlite3.OperationalError:
        return []


def create_comprehensive_db(source_dir: Path, output_db: Path):
    src_files = sorted(source_dir.glob("*.geodatabase"))
    if not src_files:
        raise SystemExit(f"No .geodatabase files found in: {source_dir}")

    if output_db.exists():
        output_db.unlink()

    out = sqlite3.connect(output_db)
    out.execute("PRAGMA journal_mode=WAL;")
    out.execute("PRAGMA synchronous=NORMAL;")
    out.execute(
        """
        CREATE TABLE source_catalog (
            source_id INTEGER PRIMARY KEY,
            source_file TEXT NOT NULL,
            source_stem TEXT NOT NULL,
            source_hash8 TEXT NOT NULL,
            imported_tables INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    out.execute(
        """
        CREATE TABLE table_catalog (
            table_id INTEGER PRIMARY KEY,
            source_id INTEGER NOT NULL,
            source_table TEXT NOT NULL,
            consolidated_table TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            column_count INTEGER NOT NULL,
            FOREIGN KEY(source_id) REFERENCES source_catalog(source_id)
        )
        """
    )

    imported_total = 0

    for src in src_files:
        stem = safe_name(src.stem)
        hash8 = hashlib.sha1(str(src).encode()).hexdigest()[:8]

        out.execute(
            "INSERT INTO source_catalog (source_file, source_stem, source_hash8) VALUES (?, ?, ?)",
            (str(src), stem, hash8),
        )
        source_id = out.execute("SELECT last_insert_rowid()").fetchone()[0]

        in_conn = sqlite3.connect(src)
        tables = list_user_tables(in_conn)
        imported_here = 0

        for table in tables:
            cols = table_columns(in_conn, table)
            if not cols:
                continue
            consolidated = f"src_{stem}_{safe_name(table)}_{hash8}"

            col_defs = ", ".join([f"{quote_ident(c)} TEXT" for c in cols])
            out.execute(f"CREATE TABLE {quote_ident(consolidated)} ({col_defs})")
            try:
                rows = in_conn.execute(f"SELECT * FROM {quote_ident(table)}").fetchall()
            except sqlite3.OperationalError:
                out.execute(f"DROP TABLE {quote_ident(consolidated)}")
                continue
            placeholders = ",".join(["?"] * len(cols))
            out.executemany(
                f"INSERT INTO {quote_ident(consolidated)} VALUES ({placeholders})",
                rows,
            )
            row_count = len(rows)

            out.execute(
                """
                INSERT INTO table_catalog
                (source_id, source_table, consolidated_table, row_count, column_count)
                VALUES (?, ?, ?, ?, ?)
                """,
                (source_id, table, consolidated, row_count, len(cols)),
            )
            imported_here += 1
            imported_total += 1

        out.execute(
            "UPDATE source_catalog SET imported_tables=? WHERE source_id=?",
            (imported_here, source_id),
        )
        in_conn.close()

    out.commit()
    out.close()
    return len(src_files), imported_total


def compare_databases(comprehensive_db: Path, active_db: Path, report_path: Path):
    a = sqlite3.connect(comprehensive_db)
    b = sqlite3.connect(active_db)

    a_tables = set(list_user_tables(a))
    b_tables = set(list_user_tables(b))

    only_a = sorted(a_tables - b_tables)
    only_b = sorted(b_tables - a_tables)
    common = sorted(a_tables & b_tables)

    lines = []
    lines.append("# Comprehensive vs Active Database Comparison")
    lines.append("")
    lines.append(f"Comprehensive DB: {comprehensive_db}")
    lines.append(f"Active DB:        {active_db}")
    lines.append("")
    lines.append(f"Total tables (comprehensive): {len(a_tables)}")
    lines.append(f"Total tables (active):        {len(b_tables)}")
    lines.append(f"Common table names:           {len(common)}")
    lines.append("")

    lines.append("## Tables only in comprehensive")
    lines.extend([f"- {t}" for t in only_a] or ["- (none)"])
    lines.append("")

    lines.append("## Tables only in active")
    lines.extend([f"- {t}" for t in only_b] or ["- (none)"])
    lines.append("")

    lines.append("## Common tables: row-count check")
    if not common:
        lines.append("- (none)")
    else:
        for t in common:
            ac = a.execute(f"SELECT COUNT(*) FROM {quote_ident(t)}").fetchone()[0]
            bc = b.execute(f"SELECT COUNT(*) FROM {quote_ident(t)}").fetchone()[0]
            status = "MATCH" if ac == bc else "DIFF"
            lines.append(f"- {t}: comprehensive={ac}, active={bc} [{status}]")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    a.close()
    b.close()


def main():
    parser = argparse.ArgumentParser(
        description="Build a comprehensive SQLite DB from .geodatabase files and compare to an active DB."
    )
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-db", required=True, type=Path)
    parser.add_argument("--active-db", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    files, tables = create_comprehensive_db(args.source_dir, args.output_db)
    compare_databases(args.output_db, args.active_db, args.report)
    print(f"Imported {tables} tables from {files} source geodatabases into {args.output_db}")
    print(f"Comparison report written to {args.report}")


if __name__ == "__main__":
    main()
