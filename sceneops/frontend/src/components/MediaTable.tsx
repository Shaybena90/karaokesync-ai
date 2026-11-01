import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileVideo, Image as ImageIcon, File, Music } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { fmtBytes, fmtDevice, fmtDuration, shortHash } from "@/lib/format";
import { MEDIA_STATUS } from "@/lib/labels";
import type { Media } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Ltr } from "./ui/misc";
import { Table, Td, Th, Tr } from "./ui/table";

const ICON = { video: FileVideo, image: ImageIcon, audio: Music, other: File };

export function MediaTable({ items }: { items: Media[] }) {
  return (
    <Table>
      <thead>
        <tr><Th>קובץ</Th><Th>מצלמה</Th><Th>תחילת הקלטה (שעון מכשיר)</Th><Th>משך</Th><Th>רזולוציה / קודק</Th><Th>גודל</Th>
          <Th>SHA-256 מקור</Th><Th>עותק עבודה</Th><Th>סטטוס</Th></tr>
      </thead>
      <tbody>
        {items.map((m) => {
          const Icon = ICON[m.media_type] ?? File;
          return (
            <Tr key={m.id}>
              <Td className="min-w-[240px]">
                <Link to={`/media/${m.id}`} className="flex items-center gap-3 hover:text-accent">
                  {m.working_copy?.has_thumbnail ? (
                    <img src={fileUrl(`/api/media/${m.id}/file/thumbnail`)} alt="" loading="lazy"
                      className="h-10 w-16 shrink-0 rounded border border-line object-cover" />
                  ) : <span className="grid h-10 w-16 shrink-0 place-items-center rounded border border-line bg-[#0c1b2e]"><Icon className="size-5 text-ink-3" /></span>}
                  <span className="min-w-0">
                    <Ltr className="block truncate font-medium">{m.file_name}</Ltr>
                    <Ltr mono className="block truncate text-xs text-ink-3">{m.relative_path}</Ltr>
                  </span>
                </Link>
              </Td>
              <Td className="whitespace-nowrap"><Ltr>{m.camera_label || "—"}</Ltr></Td>
              <Td className="whitespace-nowrap tabular"><Ltr>{fmtDevice(m.recorded_start)}</Ltr>
                {m.time_source && <div className="text-[11px] text-ink-3">מקור זמן: {m.time_source}</div>}</Td>
              <Td className="tabular"><Ltr>{fmtDuration(m.duration_seconds)}</Ltr></Td>
              <Td className="whitespace-nowrap"><Ltr>{m.width ? `${m.width}×${m.height}` : "—"}</Ltr>
                {m.codec && <div className="text-xs text-ink-3"><Ltr>{m.codec}{m.fps ? ` · ${m.fps}fps` : ""}</Ltr></div>}</Td>
              <Td className="whitespace-nowrap"><Ltr>{fmtBytes(m.size_bytes)}</Ltr></Td>
              <Td><Ltr mono className="text-xs text-ink-2" >{shortHash(m.source_sha256, 8)}</Ltr></Td>
              <Td>{m.working_copy?.verified
                ? <Badge tone="green"><CheckCircle2 />אומת</Badge>
                : m.working_copy ? <Badge tone="red">לא אומת</Badge> : <span className="text-ink-3 text-xs">—</span>}</Td>
              <Td>
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={m.status === "error" ? "red" : m.status === "indexed" || m.status === "verified" ? "blue" : "gray"}>
                    {MEDIA_STATUS[m.status] ?? m.status}</Badge>
                  {m.warnings.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-warn" title={m.warnings.join("\n")}>
                      <AlertTriangle className="size-3.5" />{m.warnings.length} אזהרות</span>
                  )}
                </div>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
