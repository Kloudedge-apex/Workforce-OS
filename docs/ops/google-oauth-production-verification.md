# Google OAuth production verification

This runbook is the reviewed submission boundary for Workforce OS Gmail
access. It records the product behavior and evidence that must be visible to a
Google reviewer. It does not authorize a verification submission, a customer
send, or a production backend cutover.

## Current state

- Google Cloud project: `supple-design-494220-v3`
- OAuth publishing status: Testing as of 2026-08-17
- Application homepage: <https://workforceos.xyz/>
- Privacy policy: <https://workforceos.xyz/privacy>
- Terms of service: <https://workforceos.xyz/terms>
- Current production callback:
  `https://apex-gtm-api.ashysmoke-fd2f7a7f.eastus.azurecontainerapps.io/api/integrations/gmail/callback`
- Current production console uses the public compatibility API. Keep that
  callback authorized until the isolated backend has passed its drain and
  release gates.
- The isolated backend callback must be added and tested before its future
  cutover. Do not remove the current callback until rollback is no longer
  required.

The homepage, privacy policy, and terms are public without authentication and
use the same `workforceos.xyz` domain. The privacy policy contains the Google
API Services User Data Policy Limited Use disclosure, explains retention and
deletion, and states that Workforce OS does not access Gmail drafts.

## Exact requested scopes

| Scope | Classification | Product use |
| --- | --- | --- |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Send one exact message only after an authorized human approves that outbound action in Workforce OS. |
| `https://www.googleapis.com/auth/gmail.readonly` | Restricted | Resolve the connected mailbox, maintain the Gmail reply watch, read relevant message/history/thread data, detect replies or delivery failures, and stop further outreach when appropriate. |

Do not request `gmail.compose`, `gmail.modify`, or `mail.google.com`. Drafts are
created and reviewed as Workforce OS records; the product does not read,
create, update, or manage Gmail drafts.

Source enforcement:

- Backend canonical scope list:
  `apps/api/src/integrations/gmail/gmail-oauth-scopes.ts` in
  `Kloudedge-apex/apex-product`
- Least-privilege backend commit:
  `61663e5156dfdd7ba275d815a1d60dc4e81acb73`
- Verified build-only backend candidate:
  GitHub run `32044262057`, ACR run `cae`, manifest digest
  `sha256:27d86718db4d6ff9bcdacc3d5eb5686e9ebc6a66bb9c91129f6c02e3384b15f6`

## Submission prerequisites

Confirm all items in Google Cloud Console before requesting verification:

1. Reauthenticate the intended Kloudedge Google account and select
   `supple-design-494220-v3`.
2. Confirm the application name, support email, developer contact, logo, and
   homepage match the public Workforce OS surfaces.
3. Confirm `workforceos.xyz` and any other OAuth authorized domain are verified
   in Google Search Console by an account that can complete verification.
4. Confirm the production OAuth client contains only reviewed JavaScript
   origins and exact redirect URIs. Remove stale localhost, preview, and
   unrelated origins from the production client.
5. Confirm the consent screen requests exactly `gmail.send` and
   `gmail.readonly` for this integration.
6. Confirm the homepage links to the privacy policy and the privacy policy
   describes Google-data access, use, sharing, retention, disconnection, and
   deletion.
7. Prepare reviewer instructions and a dedicated test account without placing
   its credentials in Git, tickets, shared memory, or this document.
8. Upload an unlisted YouTube demo that shows the OAuth client identity, each
   requested scope, and the associated in-product feature.
9. Start the restricted-scope security assessment path. Workforce OS performs
   server-side Gmail read access, so plan for the applicable CASA assessment
   and annual renewal unless Google confirms an exemption in writing.

## Reviewer demo storyboard

Use a dedicated test workspace and test mailbox. Do not use customer data.

1. Open the public homepage, privacy policy, and terms. Show the product name,
   `workforceos.xyz`, human-approval control, Limited Use disclosure, and
   Gmail-disconnection behavior.
2. Sign in to Workforce OS and open Settings > Integrations.
3. Start Gmail connection and show the Google consent screen, OAuth client
   identity, and the two requested scopes.
4. Complete connection and show Connected plus the verified reply-watch state.
5. Create a draft inside Workforce OS and show that it remains an internal
   record pending human approval; do not imply Gmail draft access.
6. Approve an exact test message and send it only to the authorized test
   mailbox. Show that `gmail.send` is used for this explicit action.
7. Reply from the test mailbox and show the reply/conversation state in
   Workforce OS. Explain that `gmail.readonly` powers mailbox identity, reply
   monitoring, delivery-failure handling, and outreach stopping.
8. Disconnect Gmail and show that new mailbox access stops and the stored
   integration credentials are deleted according to the public policy.

No real outbound send may be recorded until the exact test recipient and
message are separately approved.

## Evidence package

Attach or link the following in the verification request:

- public homepage, privacy, and terms URLs;
- unlisted demo URL;
- exact scope-to-feature justification above;
- reviewer login instructions delivered through an approved secure channel;
- authorized-domain ownership evidence;
- production OAuth client ID visible in the demo and console, but no client
  secret;
- security-assessment status and assessor evidence when required;
- a concise data-flow description covering OAuth credentials, message/thread
  reads, send results, reply/delivery processing, retention, and deletion.

## Release boundary

Google verification and backend release are separate gates. Approval of the
OAuth app does not authorize deployment of the isolated backend. The current
authority drain ends no earlier than `2026-08-26T18:49:06Z`, and deployment
still requires the signed migration/bootstrap, writer-fence, DNS/Gmail tuple,
and authenticated end-to-end evidence defined by the backend release process.

## Official references

- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google OAuth restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google OAuth sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
