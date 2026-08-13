import React, { useState } from "react";
import { useListLeads, useBulkSuppressLeads, useGetOrgSettings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Filter, Ban, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";
import { suppressionAccess } from "@/lib/capabilities";

export default function Pipeline() {
  const [, setLocation] = useLocation();
  const reduced = useReducedMotionSafe();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState<string>("0");
  const [page, setPage] = useState(1);
  const [suppressConfirmOpen, setSuppressConfirmOpen] = useState(false);
  const limit = 20;

  const { data: leadsData, isLoading: listLoading, isError, refetch } = useListLeads(
    {
      q: search || undefined,
      minScore: minScore === "0" ? undefined : Number(minScore),
      limit,
      page
    },
    { query: { queryKey: ["listLeads", search, minScore, page] } }
  );

  const leads = leadsData?.items || [];
  const total = leadsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const visibleSelectedIds = Array.from(selectedIds).filter((id) =>
    visibleLeadIds.has(id),
  );

  const suppressMut = useBulkSuppressLeads();
  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });
  const suppression = suppressionAccess(orgSettings?.canManageSuppressions);

  const clearScopedSelection = () => {
    setSelectedIds(new Set());
    setSuppressConfirmOpen(false);
  };

  const changeSearch = (value: string) => {
    clearScopedSelection();
    setSearch(value);
    setPage(1);
  };

  const changeMinScore = (value: string) => {
    clearScopedSelection();
    setMinScore(value);
    setPage(1);
  };

  const changePage = (nextPage: number) => {
    clearScopedSelection();
    setPage(nextPage);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!suppression.allowed) return;
    if (checked) {
      setSelectedIds(new Set(leads.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    if (!suppression.allowed) return;
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkSuppress = async () => {
    if (!suppression.allowed) {
      toast.error(suppression.reason);
      return;
    }
    // Defense in depth: even if a refetch swaps the rendered page after rows
    // were selected, never submit an ID the operator cannot currently see.
    const personIds = visibleSelectedIds;
    if (personIds.length === 0) return;
    setSuppressConfirmOpen(false);
    toast(`Suppressing ${personIds.length} leads...`);
    try {
      const res = await suppressMut.mutateAsync({ data: { personIds } });
      const baseSummary = [
        `${res.affectedCount} newly suppressed`,
        res.alreadySuppressedCount > 0 ? `${res.alreadySuppressedCount} already suppressed` : null,
      ].filter(Boolean).join(" · ");
      const skipped = res.results.filter((result) => result.status === "SKIPPED");
      if (skipped.length > 0) {
        const reasons = skipped.reduce<Record<string, number>>((counts, result) => {
          counts[result.reason] = (counts[result.reason] ?? 0) + 1;
          return counts;
        }, {});
        const reasonSummary = Object.entries(reasons)
          .map(([reason, count]) => `${count} ${reason.toLowerCase().replace(/_/g, " ")}`)
          .join(" · ");
        const message = `${baseSummary} · ${skipped.length} skipped (${reasonSummary}). Skipped rows remain selected.`;
        if (res.affectedCount === 0 && res.alreadySuppressedCount === 0) toast.error(message);
        else toast.warning(message);
        setSelectedIds(new Set(skipped.map((result) => result.personId)));
      } else {
        toast.success(baseSummary);
        setSelectedIds(new Set());
      }
      await refetch();
    } catch (e) {
      toast.error("Failed to suppress leads");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "bg-rust-500 text-white";
    if (score >= 80) return "bg-ember-400 text-white";
    return "bg-paper-200 text-ink-700";
  };

  return (
    <div className="flex flex-col h-full bg-paper-50 overflow-hidden">
      {/* Filters Header */}
      <div className="p-4 border-b border-paper-200 bg-white shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
              <Input 
                placeholder="Search leads..." 
                className="pl-9 bg-paper-50 border-paper-200"
                value={search}
                onChange={e => changeSearch(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative shrink-0 bg-paper-50 border-paper-200 transition-shadow duration-200 hover:shadow-sm active-elevate-2"
                >
                  <Filter className="h-4 w-4 text-ink-700" />
                  {minScore !== "0" && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rust-500 ring-2 ring-white dark:ring-card" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 bg-white dark:bg-card border-paper-200 dark:border-border shadow-md">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                      Minimum score
                    </Label>
                    <RadioGroup
                      value={minScore}
                      onValueChange={changeMinScore}
                      className="grid grid-cols-2 gap-2"
                    >
                      {[["0", "Any"], ["80", "80+"], ["90", "90+"], ["95", "95+"]].map(([val, label]) => (
                        <Label
                          key={val}
                          htmlFor={`score-${val}`}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-700 dark:text-ink-300 hover-elevate has-[:checked]:border-rust-500 has-[:checked]:text-rust-500"
                        >
                          <RadioGroupItem id={`score-${val}`} value={val} className="sr-only" />
                          <span className="font-tabular">{label}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                  {minScore !== "0" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => changeMinScore("0")}
                      className="w-full text-ink-400 hover:text-ink-900 dark:hover:text-paper-50"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex items-center gap-2">
            {visibleSelectedIds.length > 0 && suppression.allowed && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setSuppressConfirmOpen(true)}
                disabled={suppressMut.isPending}
                className="h-9 px-4"
              >
                <Ban className="h-4 w-4 mr-2" />
                Suppress {visibleSelectedIds.length}
              </Button>
            )}
          </div>
        </div>
        <AlertDialog
          open={suppressConfirmOpen && visibleSelectedIds.length > 0}
          onOpenChange={setSuppressConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Suppress selected leads?</AlertDialogTitle>
              <AlertDialogDescription>
                This blocks {visibleSelectedIds.length} currently visible
                {visibleSelectedIds.length === 1 ? " lead" : " leads"} from all
                future outreach. Review the current table before confirming.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={suppressMut.isPending}
                onClick={() => void handleBulkSuppress()}
              >
                {suppressMut.isPending ? "Suppressing…" : "Suppress leads"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!suppression.allowed && (
          <p
            className="mt-3 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-xs text-ink-600"
            data-testid="pipeline-suppression-read-only"
            role="status"
          >
            {suppression.reason}
          </p>
        )}
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-paper-50 border-b border-paper-200">
            <tr>
              <th className="p-4 w-10">
                <Checkbox 
                  checked={leads.length > 0 && visibleSelectedIds.length === leads.length}
                  onCheckedChange={handleSelectAll}
                  disabled={!suppression.allowed}
                  aria-label="Select all leads for suppression"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Lead</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider text-center">Score</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Stage</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <motion.tbody
            className="divide-y divide-paper-100"
            variants={reduced ? undefined : staggerContainer}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            {listLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                  <td className="p-4"><Skeleton className="h-10 w-48" /></td>
                  <td className="p-4"><Skeleton className="h-8 w-12 mx-auto" /></td>
                  <td className="p-4"><Skeleton className="h-6 w-20" /></td>
                  <td className="p-4"><Skeleton className="h-8 w-20 ml-auto" /></td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <ErrorState
                    title="Couldn't load the pipeline"
                    description="The leads service didn't respond. Your data is safe — try again."
                    onRetry={() => refetch()}
                  />
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    icon={Search}
                    title="No leads found"
                    description="No leads match your current search, stage, or filters. Try widening them — or clear filters to see everything."
                  />
                </td>
              </tr>
            ) : (
              leads.map(lead => (
                <motion.tr
                  key={lead.id}
                  variants={reduced ? undefined : staggerItem}
                  className="group cursor-pointer transition-all duration-200 hover:bg-paper-50 hover:shadow-sm hover:[transform:translateY(-1px)]"
                  onClick={() => setLocation(`/pipeline/${lead.id}`)}
                >
                  <td className="p-4" onClick={e => e.stopPropagation()}>
                    <Checkbox 
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => handleToggleSelect(lead.id)}
                      disabled={!suppression.allowed}
                      aria-label={`Select ${lead.name} for suppression`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-ink-900 group-hover:text-rust-500 transition-colors">
                        {lead.name}
                      </span>
                      <span className="text-xs text-ink-400">{lead.title} @ {lead.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {lead.score == null ? (
                      <span className="text-xs text-ink-400">Not scored</span>
                    ) : (
                      <Badge className={cn("font-tabular font-bold h-8 w-10 justify-center shadow-xs", getScoreColor(lead.score))}>
                        {lead.score}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="bg-paper-100 text-ink-700 capitalize">
                      {lead.stage}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocation(`/pipeline/${lead.id}`)}
                      className="h-8 gap-1 text-ink-400 transition-all hover:text-rust-500 active:scale-95"
                    >
                      View
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </td>
                </motion.tr>
              ))
            )}
          </motion.tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-4 border-t border-paper-200 bg-white flex items-center justify-between shrink-0">
        <p className="text-xs text-ink-400">
          Showing <span className="font-tabular font-semibold text-ink-900">{total === 0 ? 0 : (page - 1) * limit + 1}</span>-
          <span className="font-tabular font-semibold text-ink-900">{Math.min(page * limit, total)}</span> of 
          <span className="font-tabular font-semibold text-ink-900 ml-1"><CountUp value={total} /></span> leads
        </p>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page === 1} 
            onClick={() => changePage(Math.max(1, page - 1))}
            className="h-8 w-8 p-0 bg-paper-50 border-paper-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <Button 
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => changePage(p)}
                  className={cn(
                    "h-8 w-8 p-0 text-xs font-tabular",
                    p === page ? "bg-rust-500 hover:bg-rust-600" : "bg-paper-50 border-paper-200 text-ink-700"
                  )}
                >
                  {p}
                </Button>
              );
            })}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page >= totalPages}
            onClick={() => changePage(Math.min(totalPages, page + 1))}
            className="h-8 w-8 p-0 bg-paper-50 border-paper-200"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
