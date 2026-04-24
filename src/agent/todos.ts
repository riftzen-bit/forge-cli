export type TodoStatus = 'pending' | 'doing' | 'done';

export type Todo = {
  id: number;
  text: string;
  status: TodoStatus;
};

export class TodoStore {
  private items: Todo[] = [];
  private nextId = 1;
  private listeners = new Set<(items: Todo[]) => void>();

  list(): Todo[] {
    return [...this.items];
  }

  add(text: string): Todo {
    const todo: Todo = { id: this.nextId++, text, status: 'pending' };
    this.items.push(todo);
    this.emit();
    return todo;
  }

  setStatus(id: number, status: TodoStatus): boolean {
    const t = this.items.find((x) => x.id === id);
    if (!t) return false;
    t.status = status;
    this.emit();
    return true;
  }

  remove(id: number): boolean {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    this.emit();
    return true;
  }

  clear(): void {
    this.items = [];
    this.nextId = 1;
    this.emit();
  }

  // Replace entire list from an SDK TodoWrite payload. Each render reassigns
  // IDs so the on-screen order matches the agent's ordering.
  replaceFromAgent(items: Array<{ content?: string; activeForm?: string; status?: string }>): void {
    this.items = items.map((it, i) => {
      const status = mapAgentStatus(it.status);
      const text = (status === 'doing' ? it.activeForm : it.content) || it.content || it.activeForm || '';
      return { id: i + 1, text, status };
    });
    this.nextId = this.items.length + 1;
    this.emit();
  }

  subscribe(fn: (items: Todo[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn([...this.items]);
  }
}

export function formatTodoSummary(items: Todo[]): string {
  if (items.length === 0) return 'no todos. add with /todo add <text>';
  return items
    .map((t) => `${badge(t.status)} ${t.id}. ${t.text}`)
    .join('\n');
}

function badge(s: TodoStatus): string {
  if (s === 'done') return '[x]';
  if (s === 'doing') return '[~]';
  return '[ ]';
}

function mapAgentStatus(s?: string): TodoStatus {
  if (s === 'completed') return 'done';
  if (s === 'in_progress') return 'doing';
  return 'pending';
}
