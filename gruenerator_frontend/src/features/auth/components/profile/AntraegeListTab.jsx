import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HiOutlineTrash } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';

// Props: user, templatesSupabase, onSuccessMessage, onErrorAntraegeMessage (wird zu onErrorMessage im neuen Tab)
// Die äußeren Container und Titel werden jetzt vom übergeordneten Tab (TexteVorlagenTab) verwaltet.
const AntraegeListTab = ({ user, templatesSupabase, onSuccessMessage, onErrorAntraegeMessage, isActive }) => {
    const queryClient = useQueryClient();

    const antraegeQueryKey = ['userAntraege', user?.id];

    const fetchAntraegeFn = async () => {
        if (!user?.id || !templatesSupabase) {
        throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
        }
        console.log("[RQ Fetch Antraege] Fetching...");
        const { data, error } = await templatesSupabase
        .from('antraege')
        .select('id, title, created_at, status, description')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching antraege:", error);
            onErrorAntraegeMessage(error.message || 'Fehler beim Laden der Anträge.');
            throw new Error(error.message || 'Fehler beim Laden der Anträge.');
        }
        return data || [];
    };

    const {
        data: antraegeData,
        isLoading: isLoadingAntraege,
        isFetching: isFetchingAntraege,
        isError: isErrorAntraege,
        error: errorAntraege,
    } = useQuery({
        queryKey: antraegeQueryKey,
        queryFn: fetchAntraegeFn,
        enabled: !!user?.id && !!templatesSupabase && isActive !== false,
        staleTime: 5 * 60 * 1000,
        cacheTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const deleteAntragMutationFn = async (antragId) => {
        if (!user?.id || !antragId || !templatesSupabase) {
            throw new Error("Benutzer, Antrags-ID oder Supabase-Client nicht verfügbar.");
        }
        console.log(`[RQ Mutate Delete Antrag] Deleting ID: ${antragId}`);
        const { error: deleteError } = await templatesSupabase
        .from('antraege')
        .delete()
        .match({ id: antragId, user_id: user.id });

        if (deleteError) {
            console.error("Error deleting antrag:", deleteError);
            onErrorAntraegeMessage(deleteError.message || 'Antrag konnte nicht gelöscht werden.');
            throw new Error(deleteError.message || 'Antrag konnte nicht gelöscht werden.');
        }
        return antragId;
    };

    const {
        mutate: deleteAntrag,
        isLoading: isDeletingAntrag,
        variables: deletingAntragId,
        isError: isDeleteAntragError,
    } = useMutation({
        mutationFn: deleteAntragMutationFn,
        onSuccess: (deletedId) => {
            console.log(`[RQ Mutate Delete Antrag] Success for ID: ${deletedId}! Invalidating query...`);
            queryClient.invalidateQueries({ queryKey: antraegeQueryKey });
            onSuccessMessage('Antrag erfolgreich gelöscht.');
            onErrorAntraegeMessage('');
        },
        onError: (error) => {
            console.error("[RQ Mutate Delete Antrag] Error:", error);
            onSuccessMessage('');
        },
    });

    const handleDeleteAntrag = (antragId) => {
        if (isDeletingAntrag) return;
        if (!window.confirm("Möchtest du diesen Antrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
        onSuccessMessage('');
        onErrorAntraegeMessage('');
        deleteAntrag(antragId);
    };

    // Der äußere Container (.profile-content .antraege-section), 
    // die .profile-avatar-section und der .form-group-title wurden entfernt.
    // Diese werden jetzt vom übergeordneten TexteVorlagenTab gehandhabt.
    return (
        <>
            {isErrorAntraege && !isLoadingAntraege && (
                <div className="auth-error-message error-margin">
                    {errorAntraege instanceof Error ? errorAntraege.message : 'Fehler beim Laden der Anträge.'}
                </div>
            )}
            {isLoadingAntraege && (
                <ProfileTabSkeleton type="list" itemCount={3} />
            )}
            {!isLoadingAntraege && !isErrorAntraege && antraegeData && (
                antraegeData.length > 0 ? (
                    <ul className="antraege-list">
                        {antraegeData.map((antrag) => (
                            <li key={antrag.id} className="antrag-item">
                                <Link to={`/datenbank/antraege/${antrag.id}`} className="antrag-item-link">
                                    <div className="antrag-details">
                                        <div className="antrag-title">{antrag.title || 'Unbenannter Antrag'}</div>
                                        <div className="antrag-meta">
                                            {antrag.status && <span className="antrag-status">Status: {antrag.status}</span>}
                                            Erstellt am: {new Date(antrag.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </Link>
                                <div className="antrag-actions">
                                    <button
                                        onClick={() => handleDeleteAntrag(antrag.id)}
                                        className="antrag-delete-button icon-button danger"
                                        disabled={isDeletingAntrag && deletingAntragId === antrag.id}
                                        aria-label={`Antrag '${antrag.title || 'Unbenannter Antrag'}' löschen`}
                                    >
                                        {isDeletingAntrag && deletingAntragId === antrag.id ? <Spinner size='xsmall' /> : <HiOutlineTrash />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>Du hast noch keine Anträge gespeichert.</p>
                )
            )}
        </>
    );
}

export default AntraegeListTab; 