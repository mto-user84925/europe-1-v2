import React, { useState, useEffect, useMemo } from 'react';
import {
    Link as LinkIcon,
    Plus,
    Search,
    ExternalLink,
    Edit2,
    Trash2,
    Star,
    X,
    Save,
    Download,
    Upload,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import './LinksManager.css';

import { supabase } from '../../services/supabaseClient';

const LinksManager = () => {
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingLink, setEditingLink] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form states
    const [formData, setFormData] = useState({
        url: '',
        titre: '',
        description: '',
        is_favorite: false
    });

    useEffect(() => {
        fetchLinks();
    }, []);

    const fetchLinks = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('web_links')
            .select('*')
            .order('is_favorite', { ascending: false })
            .order('date_ajout', { ascending: false });

        if (error) console.error('Error fetching links:', error);
        else setLinks(data || []);
        setLoading(false);
    };

    const handleOpenModal = (link = null) => {
        if (link) {
            setEditingLink(link);
            setFormData({
                url: link.url,
                titre: link.titre || '',
                description: link.description,
                is_favorite: link.is_favorite
            });
        } else {
            setEditingLink(null);
            setFormData({ url: '', titre: '', description: '', is_favorite: false });
        }
        setError('');
        setShowModal(true);
    };

    const validateUrl = (url) => {
        return url.startsWith('http://') || url.startsWith('https://');
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!validateUrl(formData.url)) {
            setError("L'URL doit commencer par http:// ou https://");
            return;
        }

        if (!formData.description) {
            setError("Le champ 'À quoi ça sert' est obligatoire");
            return;
        }

        try {
            if (editingLink) {
                // Update
                const { error } = await supabase
                    .from('web_links')
                    .update({
                        url: formData.url,
                        titre: formData.titre,
                        description: formData.description,
                        is_favorite: formData.is_favorite
                    })
                    .eq('id', editingLink.id);

                if (error) throw error;
                setSuccess('Lien mis à jour !');
            } else {
                // Check if URL exists
                const existing = links.find(l => l.url.toLowerCase() === formData.url.toLowerCase());
                if (existing) {
                    setError("Ce lien est déjà enregistré.");
                    return;
                }

                // Insert
                const { error } = await supabase
                    .from('web_links')
                    .insert([formData]);

                if (error) throw error;
                setSuccess('Lien ajouté avec succès !');
            }

            setTimeout(() => {
                setShowModal(false);
                fetchLinks();
            }, 1000);

        } catch (err) {
            setError(err.message.includes('unique') ? 'Ce lien existe déjà.' : err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer ce lien ?')) return;
        const { error } = await supabase.from('web_links').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchLinks();
    };

    const toggleFavorite = async (link) => {
        const { error } = await supabase
            .from('web_links')
            .update({ is_favorite: !link.is_favorite })
            .eq('id', link.id);

        if (!error) fetchLinks();
    };

    const filteredLinks = useMemo(() => {
        return links.filter(l =>
            (l.titre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.url.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [links, searchTerm]);

    const exportCSV = () => {
        const headers = ['Titre', 'URL', 'Description', 'Favori'];
        const rows = links.map(l => [
            l.titre || '',
            l.url,
            l.description,
            l.is_favorite ? 'Oui' : 'Non'
        ]);

        const content = [headers, ...rows].map(r => r.join(';')).join('\n');
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'mes_liens_web.csv');
        link.click();
    };

    return (
        <div className="links-manager">
            <header className="links-header">
                <div className="header-left">
                    <h1><LinkIcon className="title-icon" /> Mes Liens Web</h1>
                    <p>Centralisation de vos outils et ressources</p>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary" onClick={exportCSV} title="Exporter en CSV">
                        <Download size={18} />
                    </button>
                    <button className="btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} /> Ajouter un lien
                    </button>
                </div>
            </header>

            <div className="search-bar">
                <Search className="search-icon" size={20} />
                <input
                    type="text"
                    placeholder="Rechercher par titre, description ou URL..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="links-grid">
                {loading ? (
                    <div className="loading-state">Chargement de vos liens...</div>
                ) : filteredLinks.length === 0 ? (
                    <div className="empty-state">
                        {searchTerm ? "Aucun lien ne correspond à votre recherche." : "Vous n'avez pas encore enregistré de liens."}
                    </div>
                ) : (
                    filteredLinks.map(link => (
                        <div key={link.id} className={`link-card ${link.is_favorite ? 'is-fav' : ''}`}>
                            <div className="card-header">
                                <button
                                    className={`fav-btn ${link.is_favorite ? 'active' : ''}`}
                                    onClick={() => toggleFavorite(link)}
                                >
                                    <Star size={18} fill={link.is_favorite ? "#eab308" : "none"} />
                                </button>
                                <div className="card-title-group">
                                    <h3>{link.titre || 'Sans titre'}</h3>
                                    <span className="card-url">{new URL(link.url).hostname}</span>
                                </div>
                                <div className="card-actions">
                                    <button onClick={() => handleOpenModal(link)} className="action-btn edit" title="Modifier">
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(link.id)} className="action-btn delete" title="Supprimer">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="card-body">
                                <p className="description">{link.description}</p>
                            </div>
                            <div className="card-footer">
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-open">
                                    Ouvrir <ExternalLink size={14} />
                                </a>
                                <span className="date-badge">
                                    {new Date(link.date_ajout).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal Ajouter / Modifier */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingLink ? 'Modifier le lien' : 'Ajouter un nouveau lien'}</h2>
                            <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>URL (obligatoire)</label>
                                <input
                                    type="text"
                                    placeholder="https://example.com"
                                    value={formData.url}
                                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Titre (optionnel)</label>
                                <input
                                    type="text"
                                    placeholder="Nom du site"
                                    value={formData.titre}
                                    onChange={e => setFormData({ ...formData, titre: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>À quoi ça sert ? (obligatoire)</label>
                                <textarea
                                    placeholder="Expliquez brièvement l'utilité de ce lien..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group checkbox">
                                <input
                                    type="checkbox"
                                    id="is_fav"
                                    checked={formData.is_favorite}
                                    onChange={e => setFormData({ ...formData, is_favorite: e.target.checked })}
                                />
                                <label htmlFor="is_fav">Marquer comme favori</label>
                            </div>

                            {error && <div className="msg error"><AlertCircle size={16} /> {error}</div>}
                            {success && <div className="msg success"><CheckCircle2 size={16} /> {success}</div>}

                            <div className="modal-footer">
                                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Annuler</button>
                                <button type="submit" className="btn-save">
                                    <Save size={18} /> {editingLink ? 'Enregistrer' : 'Ajouter'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LinksManager;
