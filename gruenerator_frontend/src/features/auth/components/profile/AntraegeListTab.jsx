import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HiOutlineTrash } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';

const AntraegeListTab = ({ user, templatesSupabase, onSuccessMessage, onErrorAntraegeMessage }) => {
    const queryClient = useQueryClient();

    // --- React Query: Fetch Anträge --- 
    const antraegeQueryKey = ['userAntraege', user?.id];

    const fetchAntraegeFn = async () => {
        if (!user?.id || !templatesSupabase) {
        throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
        }
        console.log("[RQ Fetch Antraege] Fetching...");
        const { data, error } = await templatesSupabase
        .from('antraege')
        .select('id, title, created_at, status, description') // Fetch needed fields
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching antraege:", error);
            onErrorAntraegeMessage(error.message || 'Fehler beim Laden der Anträge.'); // Notify parent
            throw new Error(error.message || 'Fehler beim Laden der Anträge.');
        }
        return data || [];
    };

    const {
        data: antraegeData,
        isLoading: isLoadingAntraege,
        isFetching: isFetchingAntraege, // You might use this for background refresh indicators
        isError: isErrorAntraege,
        error: errorAntraege,
    } = useQuery({
        queryKey: antraegeQueryKey,
        queryFn: fetchAntraegeFn,
        enabled: !!user?.id && !!templatesSupabase, // Query runs only when these are available
        staleTime: 5 * 60 * 1000, // 5 minutes
        cacheTime: 15 * 60 * 1000, // 15 minutes
        refetchOnWindowFocus: false,
    });

    // --- React Query: Delete Antrag Mutation --- 
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
            onErrorAntraegeMessage(deleteError.message || 'Antrag konnte nicht gelöscht werden.'); // Notify parent
            throw new Error(deleteError.message || 'Antrag konnte nicht gelöscht werden.');
        }
        return antragId;
    };

    const {
        mutate: deleteAntrag,
        isLoading: isDeletingAntrag,
        variables: deletingAntragId, // ID of the antrag being deleted
        isError: isDeleteAntragError,
        // error: deleteAntragError, // Error is passed to onErrorAntraegeMessage
        // isSuccess: isDeleteAntragSuccess, // Success message is handled in onSuccess
    } = useMutation({
        mutationFn: deleteAntragMutationFn,
        onSuccess: (deletedId) => {
            console.log(`[RQ Mutate Delete Antrag] Success for ID: ${deletedId}! Invalidating query...`);
            queryClient.invalidateQueries({ queryKey: antraegeQueryKey });
            onSuccessMessage('Antrag erfolgreich gelöscht.'); // Notify parent
            onErrorAntraegeMessage(''); // Clear error on success
        },
        onError: (error) => {
            console.error("[RQ Mutate Delete Antrag] Error:", error);
            // Error message is already sent in the mutation function
            onSuccessMessage(''); // Clear success message on error
        },
    });

    const handleDeleteAntrag = (antragId) => {
        if (isDeletingAntrag) return;
        if (!window.confirm("Möchtest du diesen Antrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
        onSuccessMessage(''); // Clear messages before starting deletion
        onErrorAntraegeMessage('');
        deleteAntrag(antragId);
    };

    return (
        <div className="profile-content antraege-section">
            <div className="profile-avatar-section">
                 <p>Hier siehst du deine gespeicherten Anträge.</p>
            </div>
            <div className="profile-form-section">
                <div className="form-group">
                   <div className="form-group-title">Meine Anträge</div>
                   {/* Error displayed via parent message area */}
                   {/* {isErrorAntraege && !isLoadingAntraege && (
                        <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
                           {errorAntraege instanceof Error ? errorAntraege.message : 'Fehler beim Laden der Anträge.'}
                        </div>
                    )} */}
                   {isLoadingAntraege && (
                       <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-large)' }}>
                           <Spinner size="medium" />
                       </div>
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
                                                   {antrag.status && <span style={{ marginRight: '8px', fontStyle: 'italic' }}>Status: {antrag.status}</span>}
                                                   Erstellt am: {new Date(antrag.created_at).toLocaleDateString()}
                                               </div>
                                                {/* Optionally show description snippet */}
                                                {/* {antrag.description && <div className="antrag-description-snippet">{antrag.description.substring(0, 100)}...</div>} */}
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
                </div>
            </div>
         </div>
    );
}

export default AntraegeListTab; 