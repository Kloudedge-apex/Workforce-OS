import React from "react";
import { useGetOrgSettings, useGetOrgHealth } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Building, ShieldCheck, CreditCard, Users, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { data: orgSettings, isLoading: settingsLoading } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] }
  });

  const { data: health, isLoading: healthLoading } = useGetOrgHealth({
    query: { queryKey: ["getOrgHealth"] }
  });

  return (
    <div className="flex flex-col h-full bg-paper-50 overflow-y-auto">
      
      {/* Health Strip */}
      <div className="bg-ink-900 text-white p-4 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {healthLoading ? (
              <Skeleton className="h-5 w-5 rounded-full bg-ink-700" />
            ) : health?.blockers.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-signal-positive" />
            ) : (
              <AlertCircle className="h-5 w-5 text-ember-400" />
            )}
            <span className="font-serif font-semibold">Workspace Health</span>
          </div>

          {!healthLoading && health && (
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <HealthItem label="Live Send" active={health.liveSendEnabled} />
              <HealthItem label="Postal Address" active={health.postalAddressConfigured} />
              <HealthItem label="Unsubscribe link" active={health.unsubscribeConfigured} />
              <div className="flex items-center gap-2">
                <span className="text-ink-400">Suppression List:</span>
                <span className="font-tabular font-medium">{health.suppressionCount} entries</span>
              </div>
            </div>
          )}

          {!healthLoading && health && health.blockers.length > 0 && (
            <Button variant="outline" size="sm" className="bg-transparent border-ember-400 text-ember-400 hover:bg-ember-400/10">
              Fix Configuration
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
        <h1 className="font-serif text-3xl font-semibold text-ink-900 mb-8">Settings</h1>

        <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-8">
          <TabsList className="flex flex-row md:flex-col h-auto bg-transparent p-0 space-y-1 justify-start overflow-x-auto w-full md:w-48 shrink-0">
            <TabTrigger value="general" icon={Building} label="General" />
            <TabTrigger value="compliance" icon={ShieldCheck} label="Compliance" />
            <TabTrigger value="integrations" icon={LinkIcon} label="Integrations" />
            <TabTrigger value="team" icon={Users} label="Team" />
            <TabTrigger value="billing" icon={CreditCard} label="Billing" />
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="general" className="m-0 space-y-6 focus-visible:outline-none">
              <Card className="shadow-sm border-paper-200">
                <CardHeader>
                  <CardTitle className="font-serif text-xl">Organization Profile</CardTitle>
                  <CardDescription>Manage your company details and core settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settingsLoading ? <Skeleton className="h-10 w-full" /> : (
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Organization Name</Label>
                      <Input id="orgName" defaultValue={orgSettings?.orgName} className="max-w-md" />
                    </div>
                  )}
                  {settingsLoading ? <Skeleton className="h-10 w-full" /> : (
                    <div className="space-y-2">
                      <Label htmlFor="postal">Physical Postal Address (Required for CAN-SPAM)</Label>
                      <Input id="postal" defaultValue={orgSettings?.postalAddress || ""} className="max-w-md" />
                    </div>
                  )}
                  <Button className="mt-4 bg-ink-900 hover:bg-ink-800 text-white">Save Changes</Button>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-paper-200 border-l-4 border-l-rust-500">
                <CardHeader>
                  <CardTitle className="font-serif text-xl text-rust-500">Live Send Control</CardTitle>
                  <CardDescription>When disabled, agents operate in Dry Run mode and cannot send emails.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between bg-paper-50 p-4 rounded-lg border border-paper-200">
                    <div className="space-y-0.5">
                      <Label className="text-base font-semibold">Enable Live Outbound</Label>
                      <p className="text-sm text-ink-400">Agents will actually dispatch emails to leads.</p>
                    </div>
                    <Switch checked={orgSettings?.liveSendEnabled} disabled={settingsLoading} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compliance" className="m-0 space-y-6 focus-visible:outline-none">
              <Card className="shadow-sm border-paper-200">
                <CardHeader>
                  <CardTitle className="font-serif text-xl">Suppression & Allowlisting</CardTitle>
                  <CardDescription>Manage who the agents can and cannot contact.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-medium text-ink-900 mb-2">Allowlisted Domains</h4>
                    <p className="text-sm text-ink-400 mb-3">Agents will only contact leads at these domains if specified. Leave empty to allow any domain.</p>
                    {settingsLoading ? <Skeleton className="h-20 w-full" /> : (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {orgSettings?.allowlistedDomains.map(d => (
                          <span key={d} className="px-2 py-1 bg-paper-100 border border-paper-200 rounded text-sm text-ink-700">{d}</span>
                        ))}
                        <Button variant="outline" size="sm" className="h-7 text-xs border-dashed">Add Domain</Button>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 border-t border-paper-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-ink-900">Global Suppression List</h4>
                      <Button variant="link" className="text-rust-500 h-auto p-0">Manage List →</Button>
                    </div>
                    <p className="text-sm text-ink-400">
                      You currently have <strong className="text-ink-900">{orgSettings?.suppressionCount || 0}</strong> addresses on the suppression list. 
                      Agents will permanently drop leads matching these addresses.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Placeholders for other tabs */}
            <TabsContent value="integrations" className="m-0 focus-visible:outline-none">
              <Card className="shadow-sm border-paper-200"><CardContent className="p-8 text-center text-ink-400">Integrations panel coming soon.</CardContent></Card>
            </TabsContent>
            <TabsContent value="team" className="m-0 focus-visible:outline-none">
              <Card className="shadow-sm border-paper-200"><CardContent className="p-8 text-center text-ink-400">Team management coming soon.</CardContent></Card>
            </TabsContent>
            <TabsContent value="billing" className="m-0 focus-visible:outline-none">
              <Card className="shadow-sm border-paper-200"><CardContent className="p-8 text-center text-ink-400">Billing details coming soon.</CardContent></Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function HealthItem({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-2 w-2 rounded-full", active ? "bg-signal-positive" : "bg-ember-400")} />
      <span className={cn("text-sm", active ? "text-paper-50" : "text-ember-400 font-medium")}>{label}</span>
    </div>
  );
}

function TabTrigger({ value, icon: Icon, label }: { value: string; icon: any; label: string }) {
  return (
    <TabsTrigger 
      value={value} 
      className="justify-start gap-3 px-4 py-2.5 font-medium text-ink-700 data-[state=active]:bg-white data-[state=active]:text-ink-900 data-[state=active]:shadow-sm rounded-md transition-all border border-transparent data-[state=active]:border-paper-200 w-full"
    >
      <Icon className="h-4 w-4" />
      {label}
    </TabsTrigger>
  );
}
