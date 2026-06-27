import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { SyncPage } from "./pages/SyncPage";
import { SchedulePage } from "./pages/SchedulePage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { TagsPage } from "./pages/TagsPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { TimeshiftPage } from "./pages/TimeshiftPage";
import { HistoryPage } from "./pages/HistoryPage";
import type { Page } from "./lib/types";

export default function App() {
  const [page, setPage] = useState<Page>("sync");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      <Sidebar current={page} onChange={setPage} />
      <main className="flex-1 overflow-hidden">
        {page === "sync"        && <SyncPage />}
        {page === "schedule"    && <SchedulePage />}
        {page === "connections" && <ConnectionsPage />}
        {page === "tags"        && <TagsPage />}
        {page === "duplicates"  && <DuplicatesPage />}
        {page === "timeshift"   && <TimeshiftPage />}
        {page === "history"     && <HistoryPage />}
      </main>
    </div>
  );
}
