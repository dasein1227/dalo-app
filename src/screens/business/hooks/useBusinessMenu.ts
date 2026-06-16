import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BusinessMenu, 
  BusinessMenuItem, 
  MenuItemsByMenuId 
} from '../components/businessTypes';
import { useTranslation } from 'react-i18next';

type BusinessFeedbackToastTone = 'default' | 'success' | 'info' | 'warning' | 'danger';

type BusinessConfirmParams = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
};

type BusinessFeedback = {
  showToast?: (message: string, tone?: BusinessFeedbackToastTone, showMark?: boolean) => void;
  confirm?: (params: BusinessConfirmParams) => void;
};

const BUSINESS_MENU_SELECT = 'id, business_id, name, category, sort_order, created_at';
const BUSINESS_MENU_ITEM_SELECT = 'id, business_id, menu_id, name, description, price, price_currency, is_signature, image_url, sort_order, created_at';

export function useBusinessMenu(businessId: string | null, feedback?: BusinessFeedback) {
  const { t } = useTranslation();
  const allMenuLabel = t('business:menu.all');
  const [menus, setMenus] = useState<BusinessMenu[]>([]);
  const [items, setItems] = useState<BusinessMenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeMenuCategory, setActiveMenuCategory] = useState<string>(allMenuLabel);
  const [newMenuTitle, setNewMenuTitle] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const showFeedbackToast = useCallback(
    (message: string, tone: BusinessFeedbackToastTone = 'default', showMark = false) => {
      feedback?.showToast?.(message, tone, showMark);
    },
    [feedback],
  );

  const requestConfirm = useCallback((params: BusinessConfirmParams) => {
    if (!feedback?.confirm) {
      console.warn('[useBusinessMenu] confirm feedback is not configured.');
      return;
    }
    feedback.confirm(params);
  }, [feedback]);

  const fetchMenuData = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      
      const [menusRes, itemsRes] = await Promise.all([
        supabase
          .from('business_menus')
          .select(BUSINESS_MENU_SELECT)
          .eq('business_id', businessId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('business_menu_items')
          .select(BUSINESS_MENU_ITEM_SELECT)
          .eq('business_id', businessId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      if (menusRes.error) throw menusRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setMenus(menusRes.data as BusinessMenu[]);
      setItems(itemsRes.data as BusinessMenuItem[]);
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:menu.fetchFail'), 'danger');
    } finally {
      setLoading(false);
    }
  }, [businessId, showFeedbackToast, t]);

  useEffect(() => {
    fetchMenuData();
  }, [fetchMenuData]);

  const menuItemsByMenuId = useMemo(() => {
    const grouped: MenuItemsByMenuId = {};
    menus.forEach(m => { grouped[m.id] = []; });
    
    items.forEach((it) => {
      const mid = it.menu_id;
      if (!mid) return;
      if (!grouped[mid]) grouped[mid] = [];
      grouped[mid].push(it);
    });
    return grouped;
  }, [menus, items]);

  const menuCategories = useMemo(() => {
    const set = new Set<string>();
    menus.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return [allMenuLabel, ...Array.from(set)];
  }, [menus, allMenuLabel]);

  const filteredMenus = useMemo(() => {
    if (activeMenuCategory === allMenuLabel) return menus;
    return menus.filter((m) => (m.category || '') === activeMenuCategory);
  }, [menus, activeMenuCategory, allMenuLabel]);

  const createMenuBoard = useCallback(async () => {
    if (!businessId) return;
    if (!newMenuTitle.trim()) {
      showFeedbackToast(t('business:menu.boardNameRequired'), 'warning');
      return;
    }

    try {
      setIsCreating(true);
      const lastOrder = menus.length > 0 ? (menus[menus.length - 1].sort_order ?? 0) : 0;
      
      const { data, error } = await supabase
        .from('business_menus')
        .insert({
          business_id: businessId,
          name: newMenuTitle.trim(),
          category: newMenuCategory.trim() || null,
          sort_order: lastOrder + 1,
        })
        .select(BUSINESS_MENU_SELECT)
        .single();

      if (error) throw error;

      setMenus(prev => [...prev, data as BusinessMenu]);
      setNewMenuTitle('');
      setNewMenuCategory('');
      showFeedbackToast(t('business:menu.boardCreateDone'), 'success', true);
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:menu.boardCreateFail'), 'danger');
    } finally {
      setIsCreating(false);
    }
  }, [businessId, menus, newMenuTitle, newMenuCategory, showFeedbackToast, t]);

  const updateMenuBoard = useCallback(async (menuId: string, name: string, category: string) => {
    try {
      const { data, error } = await supabase
        .from('business_menus')
        .update({
          name: name.trim(),
          category: category.trim() || null,
        })
        .eq('id', menuId)
        .select(BUSINESS_MENU_SELECT)
        .single();

      if (error) throw error;

      setMenus(prev => prev.map(m => m.id === menuId ? (data as BusinessMenu) : m));
      showFeedbackToast(t('business:menu.boardUpdateDone'), 'success', true);
      return true;
    } catch (e) {
      console.error(e);
      showFeedbackToast(t('business:menu.boardUpdateFail'), 'danger');
      return false;
    }
  }, [showFeedbackToast, t]);

  const deleteMenuBoard = useCallback((menuId: string) => {
    requestConfirm({
      title: t('business:menu.boardDeleteTitle'),
      message: t('business:menu.boardDeleteConfirm'),
      confirmText: t('business:common.delete'),
      cancelText: t('business:common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await supabase.from('business_menu_items').delete().eq('menu_id', menuId);
          const { error } = await supabase.from('business_menus').delete().eq('id', menuId);
          if (error) throw error;

          setMenus(prev => prev.filter(m => m.id !== menuId));
          setItems(prev => prev.filter(i => i.menu_id !== menuId));
        } catch (e) {
          console.error(e);
          showFeedbackToast(t('business:menu.boardDeleteFail'), 'danger');
        }
      },
    });
  }, [requestConfirm, showFeedbackToast, t]);

  const upsertMenuItem = useCallback(async (
    payload: Partial<BusinessMenuItem> & { menu_id: string }, 
    itemId?: string
  ) => {
    if (!businessId) return;
    
    try {
      let result: BusinessMenuItem;

      if (itemId) {
        const { data, error } = await supabase
          .from('business_menu_items')
          .update(payload)
          .eq('id', itemId)
          .select(BUSINESS_MENU_ITEM_SELECT)
          .single();
        if (error) throw error;
        result = data as BusinessMenuItem;

        setItems(prev => prev.map(it => it.id === itemId ? result : it));
      } else {
        const currentItems = menuItemsByMenuId[payload.menu_id] || [];
        const lastOrder = currentItems.length > 0 
          ? (currentItems[currentItems.length - 1].sort_order ?? 0) 
          : 0;

        const { data, error } = await supabase
          .from('business_menu_items')
          .insert({
            ...payload,
            business_id: businessId,
            sort_order: lastOrder + 1,
          })
          .select(BUSINESS_MENU_ITEM_SELECT)
          .single();
        if (error) throw error;
        result = data as BusinessMenuItem;

        setItems(prev => [...prev, result]);
      }
      return result;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [businessId, menuItemsByMenuId]);

  const deleteMenuItem = useCallback((itemId: string) => {
    requestConfirm({
      title: t('business:menu.itemDeleteTitle'),
      message: t('business:menu.itemDeleteConfirm'),
      confirmText: t('business:common.delete'),
      cancelText: t('business:common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('business_menu_items')
            .delete()
            .eq('id', itemId);
          if (error) throw error;
          setItems(prev => prev.filter(it => it.id !== itemId));
        } catch (e) {
          console.error(e);
          showFeedbackToast(t('business:menu.itemDeleteFail'), 'danger');
        }
      },
    });
  }, [requestConfirm, showFeedbackToast, t]);

  return {
    menus,
    items,
    menuItemsByMenuId,
    filteredMenus,
    menuCategories,
    loading,
    activeMenuCategory,
    setActiveMenuCategory,
    newMenuTitle,
    setNewMenuTitle,
    newMenuCategory,
    setNewMenuCategory,

    creatingMenu: isCreating,
    
    createMenuBoard,
    updateMenuBoard,
    deleteMenuBoard,
    upsertMenuItem,
    deleteMenuItem,
    refreshMenu: fetchMenuData,
  };
}
