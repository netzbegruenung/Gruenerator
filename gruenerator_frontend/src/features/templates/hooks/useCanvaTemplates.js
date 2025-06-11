import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../stores/authStore';
// import { templatesSupabase } from '../../../../components/utils/templatesSupabaseClient'; // Direkter Import, falls nicht über Context

// Hook zum Verwalten von Canva-Vorlagen eines Nutzers
export const useCanvaTemplates = () => {
  const supabaseUser = useAuthStore((state) => state.supabaseUser);
  const queryClient = useQueryClient();
  
  // TODO: Supabase-Client-Instanz sicherstellen (z.B. über Prop oder direkten Import)
  // Annahme: templatesSupabase ist als Prop verfügbar oder global importiert.
  // Für dieses Beispiel gehen wir davon aus, es wird später übergeben oder ist im Scope.

  // --- Fetch Available Categories ---
  const fetchAvailableCategories = async (templatesSupabaseInstance) => {
    if (!templatesSupabaseInstance) {
      throw new Error('Supabase client not available for fetching categories.');
    }
    const { data, error } = await templatesSupabaseInstance
      .from('template_categories') // Table name from DB
      .select('id, label')
      .order('label', { ascending: true });

    if (error) {
      console.error('Error fetching available categories:', error);
      throw error;
    }
    return data.map(cat => ({ value: cat.id, label: cat.label }));
  };

  // --- Fetch Available Tags ---
  const fetchAvailableTags = async (templatesSupabaseInstance) => {
    if (!templatesSupabaseInstance) {
      throw new Error('Supabase client not available for fetching tags.');
    }
    const { data, error } = await templatesSupabaseInstance
      .from('template_tags') // Table name from DB
      .select('id, name') // 'name' column for tags
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching available tags:', error);
      throw error;
    }
    return data.map(tag => ({ value: tag.id, label: tag.name }));
  };

  // --- Fetch Canva Templates ---
  const fetchCanvaTemplates = async (userId, templatesSupabaseInstance) => {
    if (!templatesSupabaseInstance) { // userId can be null if we fetch all global templates
      throw new Error('Supabase client not available for fetching Canva templates.');
    }
    
    let query = templatesSupabaseInstance
      .from('canva_templates')
      .select(`
        id,
        title,
        description,
        canvaurl,
        thumbnailurl,
        created_at,
        user_id, 
        credit,
        template_to_categories (
          category_id,
          template_categories (
            id,
            label
          )
        ),
        template_to_tags (
          tag_id,
          template_tags (
            id,
            name
          )
        ),
        canva_template_images (
          id,
          url,
          alt,
          display_order
        )
      `)
      .order('created_at', { ascending: false });

    if (userId) { // Only filter by user_id if it's provided
        query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;

    if (error) {
      console.error('Error fetching Canva templates:', error);
      throw error;
    }
    
    return data.map(template => ({
      ...template,
      canva_url: template.canvaurl, // Map to canva_url
      thumbnail_url: template.thumbnailurl, // Map to thumbnail_url
      category_ids: template.template_to_categories?.map(tc => tc.category_id) || [],
      categories: template.template_to_categories?.map(tc => tc.template_categories) || [],
      tag_ids: template.template_to_tags?.map(tt => tt.tag_id) || [],
      tags: template.template_to_tags?.map(tt => tt.template_tags) || [],
      images: template.canva_template_images?.sort((a, b) => a.display_order - b.display_order) || [], // Map and sort images
    }));
  };

  // --- Create Canva Template ---
  const createCanvaTemplate = async ({ templateData, templatesSupabaseInstance }) => {
    if (!supabaseUser?.id || !templatesSupabaseInstance) {
      throw new Error('User not authenticated or Supabase client not available for creating Canva template.');
    }
    const { category_ids, tag_ids, canva_url, thumbnail_url, ...restOfTemplateData } = templateData;

    const dbData = {
      ...restOfTemplateData,
      user_id: supabaseUser.id,
      canvaurl: canva_url,
      thumbnailurl: thumbnail_url,
    };

    const { data: newTemplate, error: templateError } = await templatesSupabaseInstance
      .from('canva_templates')
      .insert([dbData])
      .select()
      .single();

    if (templateError) {
      console.error('Error creating Canva template:', templateError);
      throw templateError;
    }

    // 2. Kategorien zuordnen (template_to_categories)
    if (category_ids && category_ids.length > 0) {
      const categoryRelations = category_ids.map(catId => ({
        template_id: newTemplate.id,
        category_id: catId,
      }));
      const { error: catError } = await templatesSupabaseInstance
        .from('template_to_categories')
        .insert(categoryRelations);
      if (catError) {
        // Optional: Rollback oder Fehlerbehandlung
        console.error('Error assigning categories to template:', catError);
        // Man könnte hier das erstellte Template wieder löschen oder nur einen Warnhinweis geben
      }
    }
    
    // 3. Tags zuordnen (template_to_tags)
    if (tag_ids && tag_ids.length > 0) {
      const tagRelations = tag_ids.map(tagId => ({
        template_id: newTemplate.id,
        tag_id: tagId,
      }));
      const { error: tagError } = await templatesSupabaseInstance
        .from('template_to_tags')
        .insert(tagRelations);
      if (tagError) {
        console.error('Error assigning tags to template:', tagError);
      }
    }

    return { ...newTemplate, canva_url: newTemplate.canvaurl, thumbnail_url: newTemplate.thumbnailurl, category_ids, tag_ids };
  };
  
  // --- Update Canva Template ---
  const updateCanvaTemplate = async ({ templateId, templateData, templatesSupabaseInstance }) => {
    if (!supabaseUser?.id || !templatesSupabaseInstance) {
      throw new Error('User not authenticated or Supabase client not available for updating Canva template.');
    }
    const { category_ids, tag_ids, canva_url, thumbnail_url, ...restOfTemplateData } = templateData;

    const dbData = {
      ...restOfTemplateData,
      canvaurl: canva_url,
      thumbnailurl: thumbnail_url,
    };

    const { data: updatedTemplate, error: templateError } = await templatesSupabaseInstance
      .from('canva_templates')
      .update(dbData)
      .eq('id', templateId)
      .eq('user_id', supabaseUser.id) // Sicherstellen, dass der Nutzer der Eigentümer ist
      .select()
      .single();

    if (templateError) {
      console.error('Error updating Canva template:', templateError);
      throw templateError;
    }
    if (!updatedTemplate) {
        throw new Error('Template not found or permission denied for update.');
    }

    // 2. Kategorien aktualisieren
    // Zuerst alte Verknüpfungen löschen
    await templatesSupabaseInstance.from('template_to_categories').delete().eq('template_id', templateId);
    if (category_ids && category_ids.length > 0) {
      const categoryRelations = category_ids.map(catId => ({
        template_id: templateId,
        category_id: catId,
      }));
      const { error: catError } = await templatesSupabaseInstance
        .from('template_to_categories')
        .insert(categoryRelations);
      if (catError) console.error('Error updating template categories:', catError);
    }

    // 3. Tags aktualisieren
    await templatesSupabaseInstance.from('template_to_tags').delete().eq('template_id', templateId);
    if (tag_ids && tag_ids.length > 0) {
      const tagRelations = tag_ids.map(tagId => ({
        template_id: templateId,
        tag_id: tagId,
      }));
      const { error: tagError } = await templatesSupabaseInstance.from('template_to_tags').insert(tagRelations);
      if (tagError) console.error('Error updating template tags:', tagError);
    }
    
    return { ...updatedTemplate, canva_url: updatedTemplate.canvaurl, thumbnail_url: updatedTemplate.thumbnailurl, category_ids, tag_ids };
  };

  // --- Delete Canva Template ---
  const deleteCanvaTemplate = async ({ templateId, templatesSupabaseInstance }) => {
    if (!supabaseUser?.id || !templatesSupabaseInstance) {
      throw new Error('User not authenticated or Supabase client not available for deleting Canva template.');
    }
    // Wichtig: Abhängigkeiten in template_to_categories und template_to_tags müssen zuerst gelöscht werden,
    // oder die DB muss mit ON DELETE CASCADE konfiguriert sein.
    // Hier gehen wir davon aus, dass RLS das Löschen nur für den Eigentümer erlaubt.
    
    // Zuerst Verknüpfungen löschen (sicherer Ansatz, falls kein CASCADE)
    await templatesSupabaseInstance.from('template_to_categories').delete().eq('template_id', templateId);
    await templatesSupabaseInstance.from('template_to_tags').delete().eq('template_id', templateId);
    // Ggf. auch template_images löschen, falls diese Tabelle existiert und verknüpft ist

    const { error } = await templatesSupabaseInstance
      .from('canva_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', supabaseUser.id); // Sicherstellen, dass der Nutzer der Eigentümer ist

    if (error) {
      console.error('Error deleting Canva template:', error);
      throw error;
    }
    return templateId; // ID des gelöschten Templates zurückgeben
  };

  // --- React Query Mutations ---
  const createMutation = useMutation({
    mutationFn: (params) => createCanvaTemplate(params), // params = { templateData, templatesSupabaseInstance }
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', supabaseUser?.id] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (params) => updateCanvaTemplate(params), // params = { templateId, templateData, templatesSupabaseInstance }
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', supabaseUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['canvaTemplate', variables.templateId] }); // Auch Einzeleintrag invalidieren
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (params) => deleteCanvaTemplate(params), // params = { templateId, templatesSupabaseInstance }
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvaTemplates', supabaseUser?.id] });
    },
  });
  
  // Hook gibt die Query-Funktion, die Mutations und ggf. Lade-/Fehlerzustände zurück
  return {
    fetchCanvaTemplates, // Die Funktion selbst, falls man sie manuell aufrufen möchte
    fetchAvailableCategories,
    fetchAvailableTags,
    // `useQuery` würde hier typischerweise direkt im Hook aufgerufen werden,
    // aber da templatesSupabaseInstance von außen kommt, machen wir es flexibler.
    // Beispiel für die Verwendung in einer Komponente:
    // const { data, isLoading, isError } = useQuery({
    //   queryKey: ['canvaTemplates', supabaseUser?.id],
    //   queryFn: () => fetchCanvaTemplates(supabaseUser?.id, templatesSupabase), // templatesSupabase aus Props/Context
    //   enabled: !!supabaseUser?.id && !!templatesSupabase,
    // });
    
    createCanvaTemplate: createMutation.mutate,
    isCreatingCanvaTemplate: createMutation.isLoading,
    createCanvaTemplateError: createMutation.error,
    
    updateCanvaTemplate: updateMutation.mutate,
    isUpdatingCanvaTemplate: updateMutation.isLoading,
    updateCanvaTemplateError: updateMutation.error,

    deleteCanvaTemplate: deleteMutation.mutate,
    isDeletingCanvaTemplate: deleteMutation.isLoading,
    deleteCanvaTemplateError: deleteMutation.error,
  };
}; 