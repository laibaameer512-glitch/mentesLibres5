import React, { useState, useEffect } from 'react';
import { DecoyNote, loadAllDecoyNotes, saveDecoyNote } from '../lib/db.ts';
import { PanicBar } from './PanicBar.tsx';
import { BookOpen, ShoppingBag, Utensils, Calculator, Plus, Search, Trash2 } from 'lucide-react';

interface DecoyVaultProps {
  decoyKey: CryptoKey;
  onPanicLock: () => void;
}

export const DecoyVault: React.FC<DecoyVaultProps> = ({ decoyKey, onPanicLock }) => {
  const [notes, setNotes] = useState<DecoyNote[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNote, setSelectedNote] = useState<DecoyNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<DecoyNote['category']>('Grocery');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    loadAllDecoyNotes(decoyKey)
      .then((data) => {
        setNotes(data);
        if (data.length > 0) setSelectedNote(data[0]);
      })
      .catch((err) => console.error('Failed to load decoy notes:', err));
  }, [decoyKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newNote: DecoyNote = {
      id: `decoy-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory,
      content: newContent,
      updatedAt: new Date().toISOString(),
    };

    await saveDecoyNote(decoyKey, newNote);
    const updated = [newNote, ...notes];
    setNotes(updated);
    setSelectedNote(newNote);
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
  };

  const filtered = notes.filter((n) => {
    const matchesCat = activeCategory === 'All' || n.category === activeCategory;
    const matchesSearch =
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getCategoryIcon = (cat: DecoyNote['category']) => {
    switch (cat) {
      case 'Recipe':
        return <Utensils className="w-3.5 h-3.5 text-amber-400" />;
      case 'Grocery':
        return <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Formulas':
        return <Calculator className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <PanicBar onPanicLock={onPanicLock} vaultType="decoy" />

      {/* Innocuous Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            <span>My Personal Notebook</span>
          </h1>
          <p className="text-xs text-slate-400">Offline memos, kitchen recipes & study references</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Note</span>
        </button>
      </header>

      {/* Main Layout: Mobile single-column or desktop split */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col md:flex-row gap-4">
        {/* Sidebar list */}
        <div className="w-full md:w-80 flex flex-col gap-3">
          {/* Search & Category Pills */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {['All', 'Grocery', 'Recipe', 'Study Notes', 'Formulas'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${
                  activeCategory === cat
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[60vh] md:max-h-[70vh]">
            {filtered.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  setSelectedNote(note);
                  setIsCreating(false);
                }}
                className={`p-3 rounded-xl border cursor-pointer transition ${
                  selectedNote?.id === note.id
                    ? 'bg-slate-900 border-slate-700 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    {getCategoryIcon(note.category)}
                    {note.title}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {note.content}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Note viewer / creator */}
        <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col">
          {isCreating ? (
            <form onSubmit={handleCreate} className="space-y-4 flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Write New Note</h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                placeholder="Note title (e.g. Science Revision)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-slate-600"
              />
              <div className="flex gap-2">
                {(['Grocery', 'Recipe', 'Study Notes', 'Formulas'] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setNewCategory(c)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                      newCategory === c
                        ? 'bg-slate-800 text-white border-slate-600'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Write your note or list items here..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={10}
                className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-slate-600 resize-none font-mono"
              />
              <button
                type="submit"
                className="self-end px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Save to Notes
              </button>
            </form>
          ) : selectedNote ? (
            <div className="flex flex-col flex-1">
              <div className="border-b border-slate-800 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getCategoryIcon(selectedNote.category)}
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                      {selectedNote.category}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white">{selectedNote.title}</h2>
                </div>
                <span className="text-xs text-slate-500">
                  Last updated {new Date(selectedNote.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex-1 whitespace-pre-wrap text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                {selectedNote.content}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
              Select or create a note to view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
