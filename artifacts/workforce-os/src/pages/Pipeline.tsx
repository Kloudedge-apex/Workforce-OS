import React, { useState } from "react";
import { useListLeads, useBulkSuppressLeads } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Search, Filter, Ban, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { CohortBadge } from "@/components/v2/CohortBadge";
import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";

export default function Pipeline() {
  const [, setLocation] = useLocation();
  const reduced = useReducedMotionSafe();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("0");
  const [cohort, setCohort] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: leadsData, isLoading: listLoading, isError, refetch } = useListLeads(
    {
      q: search || undefined,
      stage: stage === "all" ? undefined : stage,
      minScore: minScore === "0" ? undefined : Number(minScore),
      cohort: cohort === "all" ? undefined : cohort,
      limit,
      page
    },
    { query: { queryKey: ["listLeads", search, stage, minScore, cohort, page] } }
  );

  const leads = leadsData?.items || [];
  const total = leadsData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const suppressMut = useBulkSuppressLeads();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(leads.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkSuppress = async () => {
    if (selectedIds.size === 0) return;
    toast(`Suppressing ${selectedIds.size} leads...`);
    try {
      await suppressMut.mutateAsync({ data: { ids: Array.from(selectedIds) } });
      toast.success("Leads suppressed");
      setSelectedIds(new Set());
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
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select value={stage} onValueChange={(v) => { setStage(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] bg-paper-50 border-paper-200">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="researching">Researching</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative shrink-0 bg-paper-50 border-paper-200 transition-shadow duration-200 hover:shadow-sm active-elevate-2"
                >
                  <Filter className="h-4 w-4 text-ink-700" />
                  {(minScore !== "0" || cohort !== "all") && (
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
                      onValueChange={(v) => { setMinScore(v); setPage(1); }}
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
                  <Separator className="bg-paper-200 dark:bg-border" />
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                      Cohort
                    </Label>
                    <RadioGroup
                      value={cohort}
                      onValueChange={(v) => { setCohort(v); setPage(1); }}
                      className="grid grid-cols-3 gap-2"
                    >
                      {[["all", "All"], ["A", "A"], ["B", "B"]].map(([val, label]) => (
                        <Label
                          key={val}
                          htmlFor={`cohort-${val}`}
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-700 dark:text-ink-300 hover-elevate has-[:checked]:border-rust-500 has-[:checked]:text-rust-500"
                        >
                          <RadioGroupItem id={`cohort-${val}`} value={val} className="sr-only" />
                          <span className="font-mono">{label}</span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>
                  {(minScore !== "0" || cohort !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setMinScore("0"); setCohort("all"); setPage(1); }}
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
            {selectedIds.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleBulkSuppress}
                disabled={suppressMut.isPending}
                className="h-9 px-4"
              >
                <Ban className="h-4 w-4 mr-2" />
                Suppress {selectedIds.size}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-paper-50 border-b border-paper-200">
            <tr>
              <th className="p-4 w-10">
                <Checkbox 
                  checked={leads.length > 0 && selectedIds.size === leads.length} 
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Lead</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider text-center">Score</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Stage</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Cohort</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Email</th>
              <th className="px-4 py-3 font-semibold text-ink-400 uppercase text-[10px] tracking-wider">Intent Signals</th>
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
                  <td className="p-4"><Skeleton className="h-6 w-16" /></td>
                  <td className="p-4"><Skeleton className="h-6 w-24" /></td>
                  <td className="p-4"><div className="flex gap-1"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /></div></td>
                  <td className="p-4"><Skeleton className="h-8 w-20 ml-auto" /></td>
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-20 text-center text-ink-400">
                  <div className="flex flex-col items-center">
                    <Search className="h-12 w-12 opacity-10 mb-4" />
                    <p className="text-lg font-serif">No leads found</p>
                    <p className="text-sm">Try adjusting your filters or search query.</p>
                  </div>
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
                    <Badge className={cn("font-tabular font-bold h-8 w-10 justify-center shadow-xs", getScoreColor(lead.score))}>
                      {lead.score}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="bg-paper-100 text-ink-700 capitalize">
                      {lead.stage}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <CohortBadge cohort={lead.cohort} />
                  </td>
                  <td className="px-4 py-3">
                    <EmailStatusBadge status={lead.emailStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.intentSignals.slice(0, 2).map((sig, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-paper-100 text-ink-400 text-[10px] font-medium rounded border border-paper-200">
                          {sig.label}
                        </span>
                      ))}
                      {lead.intentSignals.length > 2 && (
                        <span className="text-[10px] text-ink-400">+{lead.intentSignals.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 text-ink-400 hover:text-ink-900">
                      Edit
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
          Showing <span className="font-tabular font-semibold text-ink-900">{(page - 1) * limit + 1}</span>-
          <span className="font-tabular font-semibold text-ink-900">{Math.min(page * limit, total)}</span> of 
          <span className="font-tabular font-semibold text-ink-900 ml-1"><CountUp value={total} /></span> leads
        </p>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page === 1} 
            onClick={() => setPage(p => p - 1)}
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
                  onClick={() => setPage(p)}
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
            disabled={page === totalPages} 
            onClick={() => setPage(p => p + 1)}
            className="h-8 w-8 p-0 bg-paper-50 border-paper-200"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
