/**
 * CommitDonate: pick an open bug or enhancement and copy an agent prompt
 * that implements the issue and opens a pull request.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import commitDonateLogo from '../assets/commit-donate-logo.jpg';
import commitCoin from '../assets/commit-coin.png';

const REPO = 'avidan-efody/wave_browser';
const REPO_CLONE_URL = `https://github.com/${REPO}.git`;
const ISSUES_URL = `https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`;

const SKIP_LABELS = new Set(['documentation', 'question', 'duplicate', 'invalid', 'wontfix']);
const EXTRA_LABELS = new Set(['good first issue', 'help wanted']);

type IssueKind = 'bug' | 'enhancement';

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: GitHubLabel[];
  pull_request?: unknown;
}

interface DonateIssue {
  number: number;
  title: string;
  body: string;
  htmlUrl: string;
  kind: IssueKind;
}

function classify(issue: GitHubIssue): IssueKind | null {
  if (issue.pull_request) return null;
  const names = issue.labels.map((label) => label.name.toLowerCase());
  if (names.includes('bug')) return 'bug';
  if (names.includes('enhancement')) return 'enhancement';
  // Open requests in this repo are often filed without a label.
  if (names.length === 0) return 'enhancement';
  if (names.every((name) => EXTRA_LABELS.has(name))) return 'enhancement';
  if (names.some((name) => SKIP_LABELS.has(name))) return null;
  return null;
}

function branchSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'change';
}

export function buildAgentPrompt(issue: DonateIssue): string {
  const branch = `${issue.kind === 'bug' ? 'fix' : 'feat'}/issue-${issue.number}-${branchSlug(issue.title)}`;
  const verb = issue.kind === 'bug' ? 'Fix' : 'Add';
  const description = issue.body.trim() || '(No description was provided on the issue.)';

  return `Take GitHub issue #${issue.number} in the Wave Browser repository, implement it, and open a pull request.

Issue
Title: ${issue.title}
Number: #${issue.number}
Kind: ${issue.kind}
URL: ${issue.htmlUrl}

Description
${description}

Clone the repository and start from main:

git clone ${REPO_CLONE_URL}
cd wave_browser
git checkout main
git pull origin main
git checkout -b ${branch}

Implement the issue described above. Keep the change limited to this issue. Read the surrounding code before editing. For frontend changes, install dependencies if needed and run the production build from the frontend directory:

cd frontend
npm install
npm run build

Commit the change with a message that explains why it exists and includes this line:

Fixes #${issue.number}

Push the branch and open a pull request against main:

git push -u origin HEAD
gh pr create --base main --title "${verb}: ${issue.title.replace(/"/g, "'")}" --body "Fixes #${issue.number}"

The pull request body must include this line on its own so GitHub closes the issue when the pull request is merged:

Fixes #${issue.number}

Also summarize what changed and how you checked it. Do not force-push, and do not change git configuration. Finish by returning the pull request URL.`;
}

export function CommitDonate() {
  const [issues, setIssues] = useState<DonateIssue[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedNumber, setSelectedNumber] = useState('');
  const [activeIssue, setActiveIssue] = useState<DonateIssue | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(ISSUES_URL, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`GitHub returned ${response.status}`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('Unexpected response from GitHub');
        }
        const donateIssues = (data as GitHubIssue[])
          .map((issue) => {
            const kind = classify(issue);
            if (!kind) return null;
            return {
              number: issue.number,
              title: issue.title,
              body: issue.body ?? '',
              htmlUrl: issue.html_url,
              kind,
            };
          })
          .filter((issue): issue is DonateIssue => issue !== null)
          .sort((a, b) => b.number - a.number);
        setIssues(donateIssues);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Could not load issues';
        setErrorMessage(message);
        setStatus('error');
      }
    };

    load();
    return () => controller.abort();
  }, []);

  const bugs = useMemo(() => issues.filter((issue) => issue.kind === 'bug'), [issues]);
  const enhancements = useMemo(
    () => issues.filter((issue) => issue.kind === 'enhancement'),
    [issues],
  );
  const prompt = activeIssue ? buildAgentPrompt(activeIssue) : '';

  const openPrompt = () => {
    const issue = issues.find((item) => String(item.number) === selectedNumber);
    if (!issue) return;
    setCopyMessage('');
    setActiveIssue(issue);
  };

  const closePrompt = useCallback(() => {
    setActiveIssue(null);
    setCopyMessage('');
  }, []);

  useEffect(() => {
    if (!activeIssue) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePrompt();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIssue, closePrompt]);

  const copyPrompt = () => {
    const field = promptRef.current;
    if (field) {
      field.focus();
      field.select();
      try {
        if (document.execCommand('copy')) {
          setCopyMessage('Copied');
          return;
        }
      } catch {
        // Fall through to the async clipboard API.
      }
    }

    navigator.clipboard.writeText(prompt).then(
      () => setCopyMessage('Copied'),
      () => setCopyMessage(field ? 'Selected — press ⌘C' : 'Copy failed'),
    );
  };

  const placeholder = status === 'loading'
    ? 'Loading issues...'
    : status === 'error'
      ? 'Could not load issues'
      : issues.length === 0
        ? 'No open bugs or enhancements'
        : 'bug or enhancement';

  return (
    <>
      <div className="flex items-center gap-2 pl-2 border-l border-wave-border">
        <select
          aria-label="Bugs and enhancements"
          value={selectedNumber}
          disabled={status !== 'ready' || issues.length === 0}
          onChange={(event) => setSelectedNumber(event.target.value)}
          className="max-w-[16rem] min-w-[12rem] bg-wave-bg border border-wave-border rounded px-2 py-1.5 text-xs text-wave-text disabled:opacity-60"
          title={status === 'error' ? errorMessage : 'Open bugs and enhancements'}
        >
          <option value="">{placeholder}</option>
          {bugs.length > 0 && (
            <optgroup label="Bugs">
              {bugs.map((issue) => (
                <option key={issue.number} value={issue.number}>
                  #{issue.number} {issue.title}
                </option>
              ))}
            </optgroup>
          )}
          {enhancements.length > 0 && (
            <optgroup label="Enhancements">
              {enhancements.map((issue) => (
                <option key={issue.number} value={issue.number}>
                  #{issue.number} {issue.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={openPrompt}
          disabled={!selectedNumber}
          aria-label="commit #6a7d7738"
          title="commit #6a7d7738"
          className="h-16 p-0 bg-transparent leading-none disabled:opacity-40"
        >
          <img src={commitCoin} alt="" className="h-16 w-auto" />
        </button>
      </div>

      {activeIssue && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closePrompt}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="commit-donate-title"
            className="bg-wave-panel border border-wave-border rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-wave-border">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={commitDonateLogo}
                  alt=""
                  className="h-52 w-auto rounded-md ring-1 ring-wave-border object-contain flex-shrink-0"
                />
                <div className="min-w-0">
                  <h2 id="commit-donate-title" className="font-medium">CommitDonate</h2>
                  <p className="text-xs text-wave-text/70 truncate">
                    #{activeIssue.number} {activeIssue.title}
                  </p>
                </div>
              </div>
              <button onClick={closePrompt} className="p-1 hover:bg-wave-border rounded" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 flex flex-col gap-3 overflow-hidden">
              <p className="text-sm text-wave-text/80">
                Give this prompt to an agent. It includes the issue and the steps to clone the repo, fix it, and open a pull request.
              </p>
              <textarea
                ref={promptRef}
                readOnly
                value={prompt}
                className="w-full h-80 resize-none bg-wave-bg border border-wave-border rounded px-3 py-2 text-xs font-mono text-wave-text"
                aria-label="Agent prompt"
              />
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-wave-border">
              <a
                href={activeIssue.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-wave-accent hover:underline"
              >
                View issue on GitHub
              </a>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="px-3 py-1.5 text-sm bg-wave-accent text-wave-bg rounded hover:bg-wave-accent/80"
                >
                  {copyMessage || 'Copy prompt'}
                </button>
                <button
                  type="button"
                  onClick={closePrompt}
                  className="px-3 py-1.5 text-sm bg-wave-border text-wave-text rounded hover:bg-wave-border/80"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
