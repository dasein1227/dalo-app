import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  cancelAnimation,
  useDerivedValue,
  runOnJS, // 🚀 핵심: UI 스레드와 JS 스레드 충돌을 막기 위해 필수
} from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { 
  X, Check, RotateCw, RefreshCcw, Monitor, Smartphone, Square, Layout, 
  RectangleHorizontal, RectangleVertical, Scan
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WORKSPACE_PADDING = 20;
const WORKSPACE_WIDTH = SCREEN_WIDTH - WORKSPACE_PADDING * 2; 
const WORKSPACE_HEIGHT = WORKSPACE_WIDTH * 1.6; 
const MAX_DISPLAY_WIDTH = 1080;
const COONN_EDITOR_ACCENT = '#FF5A7A';

const normalizeHexColor = (value?: string | null): string | null => {
  const raw = String(value || '').trim();
  const shortHex = raw.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const longHex = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (longHex) {
    return `#${longHex[1]}`.toUpperCase();
  }

  return null;
};

const isTooDarkForBlackHeader = (value?: string | null): boolean => {
  const hex = normalizeHexColor(value);
  if (!hex) return false;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance < 0.28;
};


const SPRING_CONFIG = {
  damping: 40,      
  stiffness: 250,   
  mass: 1,          
  overshootClamping: true, 
};

const RATIOS = [
  { id: 'original', label: 'Original', value: null, icon: Monitor }, 
  { id: '1:1', label: '1:1', value: 1, icon: Square },
  { id: '4:5', label: '4:5', value: 0.8, icon: Layout },     
  { id: '3:4', label: '3:4', value: 0.75, icon: Layout },     
  { id: '9:16', label: '9:16', value: 0.5625, icon: Smartphone }, 
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (uri: string, width: number, height: number) => void;
  sourceUri: string;
  themeColor?: string;
  initialRatio?: number | null;
  initialInverted?: boolean;
};

export default function UniversalImageEditor({ 
  visible, 
  onClose, 
  onSave, 
  sourceUri,
  themeColor = '#007AFF',
  initialRatio,
  initialInverted = false,
}: Props) {
  const { t } = useTranslation();
  const editorAccent = useMemo(
    () => (isTooDarkForBlackHeader(themeColor) ? COONN_EDITOR_ACCENT : themeColor),
    [themeColor],
  );

  const [originalSize, setOriginalSize] = useState<{ width: number; height: number } | null>(null);
  const [displayImage, setDisplayImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [customRatio, setCustomRatio] = useState<number | null>(null);
  const [selectedRatioId, setSelectedRatioId] = useState<string>('original');
  const [rotation, setRotation] = useState(0); 
  const [isRatioInverted, setIsRatioInverted] = useState(false); 
  const [showRatioPicker, setShowRatioPicker] = useState(false);

  const isRatioLocked = initialRatio !== undefined && initialRatio !== null;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const rotateVal = useDerivedValue(() => {
    return withTiming(rotation, { duration: 300 });
  });

  useEffect(() => {
    if (visible && sourceUri) {
      setLoading(true);
      setRotation(0);
      setShowRatioPicker(false);
      resetTransform();
      setIsRatioInverted(initialInverted);

      if (initialRatio) {
        setCustomRatio(initialRatio);
        const match = RATIOS.find(r => r.value && Math.abs(r.value - initialRatio) < 0.02);
        setSelectedRatioId(match ? match.id : 'custom');
      } else {
        setCustomRatio(null);
        setSelectedRatioId('original');
      }

      const prepareImage = async () => {
        try {
          const origin = await ImageManipulator.manipulateAsync(sourceUri, []);
          setOriginalSize({ width: origin.width, height: origin.height });
          if (origin.width > MAX_DISPLAY_WIDTH) {
             const resized = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: { width: MAX_DISPLAY_WIDTH } }], { format: ImageManipulator.SaveFormat.JPEG, compress: 1 });
             setDisplayImage({ uri: resized.uri, width: resized.width, height: resized.height });
          } else {
             setDisplayImage({ uri: sourceUri, width: origin.width, height: origin.height });
          }
        } catch (e) {
          Alert.alert(t('imageEditor:error_load_title'), t('imageEditor:error_load_msg'));
          onClose();
        } finally {
          setLoading(false);
        }
      };
      prepareImage();
    }
  }, [visible, sourceUri, initialRatio, initialInverted]);

  const resetTransform = () => {
    'worklet';
    cancelAnimation(scale); 
    cancelAnimation(translateX); 
    cancelAnimation(translateY);
    scale.value = withTiming(1); 
    savedScale.value = 1;
    translateX.value = withTiming(0); 
    translateY.value = withTiming(0);
    savedTx.value = 0; 
    savedTy.value = 0;
  };

  const frameRect = useMemo(() => {
    if (!displayImage) return { width: WORKSPACE_WIDTH, height: WORKSPACE_WIDTH };
    
    const ratioItem = RATIOS.find(r => r.id === selectedRatioId);
    let targetRatio = customRatio !== null ? customRatio : ratioItem?.value;

    if (!targetRatio) {
      const isPortrait = rotation % 180 === 0;
      const w = isPortrait ? displayImage.width : displayImage.height;
      const h = isPortrait ? displayImage.height : displayImage.width;
      targetRatio = w / h;
    } 
    
    if (isRatioInverted) targetRatio = 1 / targetRatio;

    let w = WORKSPACE_WIDTH;
    let h = w / targetRatio;

    if (h > WORKSPACE_HEIGHT) {
      h = WORKSPACE_HEIGHT;
      w = h * targetRatio;
    }
    if (w > WORKSPACE_WIDTH) {
       w = WORKSPACE_WIDTH;
       h = w / targetRatio;
    }

    return { width: w, height: h };
  }, [selectedRatioId, customRatio, isRatioInverted, displayImage, rotation]);

  const fitScale = useMemo(() => {
    if (!displayImage) return 1;
    const isPortrait = rotation % 180 === 0;
    const w = isPortrait ? displayImage.width : displayImage.height;
    const h = isPortrait ? displayImage.height : displayImage.width;
    return Math.max(frameRect.width / w, frameRect.height / h);
  }, [displayImage, rotation, frameRect]);

  // 🚀 안전 조치 1: 'worklet'을 제거하고 완전한 JS 함수로 분리하여 상태(State) 참조 버그 원천 차단
  const onInteractionEndJS = () => {
    if (!displayImage) return;
    const isPortrait = rotation % 180 === 0;
    const imgW = isPortrait ? displayImage.width : displayImage.height;
    const imgH = isPortrait ? displayImage.height : displayImage.width;
    
    const currentFitScale = Math.max(frameRect.width / imgW, frameRect.height / imgH);
    const currentRealScale = currentFitScale * scale.value;
    const displayW = imgW * currentRealScale;
    const displayH = imgH * currentRealScale;

    if (displayW < frameRect.width || displayH < frameRect.height) {
       if (displayW < frameRect.width - 2 || displayH < frameRect.height - 2) {
         scale.value = withSpring(1, SPRING_CONFIG);
         savedScale.value = 1;
         translateX.value = withSpring(0, SPRING_CONFIG);
         translateY.value = withSpring(0, SPRING_CONFIG);
         savedTx.value = 0;
         savedTy.value = 0;
         return;
       }
    }
    const maxTx = Math.max(0, (displayW - frameRect.width) / 2);
    const maxTy = Math.max(0, (displayH - frameRect.height) / 2);
    let newX = translateX.value;
    let newY = translateY.value;
    let needSnap = false;
    
    if (newX > maxTx) { newX = maxTx; needSnap = true; } 
    else if (newX < -maxTx) { newX = -maxTx; needSnap = true; }
    
    if (newY > maxTy) { newY = maxTy; needSnap = true; } 
    else if (newY < -maxTy) { newY = -maxTy; needSnap = true; }
    
    if (needSnap) {
        translateX.value = withSpring(newX, SPRING_CONFIG);
        translateY.value = withSpring(newY, SPRING_CONFIG);
        savedTx.value = newX;
        savedTy.value = newY;
    }
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => { 
      savedScale.value = scale.value; 
      runOnJS(onInteractionEndJS)(); // 🚀 JS 스레드로 던져서 안전하게 실행
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => { 
      translateX.value = savedTx.value + e.translationX; 
      translateY.value = savedTy.value + e.translationY; 
    })
    .onEnd(() => { 
      savedTx.value = translateX.value; 
      savedTy.value = translateY.value; 
      runOnJS(onInteractionEndJS)(); // 🚀 JS 스레드로 던져서 안전하게 실행
    });

  const gesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * fitScale }, 
      { rotateZ: `${rotateVal.value}deg` } 
    ],
  }), [fitScale]);

  const handleSave = async () => {
    if (!displayImage || !originalSize || processing) return;
    setProcessing(true);
    try {
      // 🚀 안전 조치 2: 회전에 따른 가로/세로 스왑(Swap) 완벽 보정
      const isPortrait = rotation % 180 === 0;
      const dImgW = isPortrait ? displayImage.width : displayImage.height;
      const dImgH = isPortrait ? displayImage.height : displayImage.width;
      
      const calcFitScale = Math.max(frameRect.width / dImgW, frameRect.height / dImgH);
      const finalScaleOnDisplay = calcFitScale * scale.value; 
      const displayedW = dImgW * finalScaleOnDisplay;
      const displayedH = dImgH * finalScaleOnDisplay;

      const frameLeft = (displayedW - frameRect.width) / 2 - translateX.value;
      const frameTop = (displayedH - frameRect.height) / 2 - translateY.value;

      // 회전(Rotate) 명령이 들어가면 원본 이미지 자체가 뒤집히므로 그에 맞춰 기준점을 변경해야 함
      const rotatedOrigW = isPortrait ? originalSize.width : originalSize.height;
      const rotatedOrigH = isPortrait ? originalSize.height : originalSize.width;

      const scaleFactor = rotatedOrigW / displayedW; 

      // 🚀 안전 조치 3: Math.floor와 Math.max를 통한 좌표계 이탈(Out-Of-Bounds) 완벽 방어
      let originX = Math.floor(Math.max(0, frameLeft * scaleFactor));
      let originY = Math.floor(Math.max(0, frameTop * scaleFactor));
      let cropW = Math.floor(frameRect.width * scaleFactor);
      let cropH = Math.floor(frameRect.height * scaleFactor);

      // 미세 오차 보정 (경계선 넘침 방어)
      if (originX + cropW > rotatedOrigW) cropW = rotatedOrigW - originX;
      if (originY + cropH > rotatedOrigH) cropH = rotatedOrigH - originY;

      const actions: ImageManipulator.Action[] = [];
      if (rotation !== 0) actions.push({ rotate: rotation }); // 회전을 먼저 수행하고
      actions.push({ 
        crop: { 
          originX, 
          originY, 
          width: cropW, 
          height: cropH 
        } 
      }); // 뒤집힌 기준점 위에서 크롭을 수행!

      const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.95, 
      });

      onSave(result.uri, result.width, result.height);
      onClose();
    } catch (e) {
      console.error(e);
      Alert.alert(t('imageEditor:error_save_title'), t('imageEditor:error_save_msg'));
    } finally {
      setProcessing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={10}>
              <X color="#fff" size={26} />
            </Pressable>
            
            <View style={styles.headerCenter}>
               <Text style={styles.headerTitle}>{t('imageEditor:title')}</Text>
            </View>
            
            <Pressable onPress={handleSave} style={styles.headerBtn} disabled={processing || loading} hitSlop={10}>
               {processing ? (
                 <ActivityIndicator color={editorAccent} />
               ) : (
                 <Check color={editorAccent} size={26} />
               )}
            </Pressable>
          </View>

          {/* Workspace */}
          <View style={styles.workspace}>
            {loading || !displayImage ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <View 
                style={{ 
                  width: frameRect.width, 
                  height: frameRect.height, 
                  overflow: 'hidden', 
                  backgroundColor: '#1a1a1a', 
                }}
              >
                <GestureDetector gesture={gesture}>
                  <Animated.Image
                    source={{ uri: displayImage.uri }}
                    style={[
                      {
                        width: displayImage.width,
                        height: displayImage.height,
                        position: 'absolute',
                        left: '50%', top: '50%',
                        marginLeft: -displayImage.width / 2, 
                        marginTop: -displayImage.height / 2,
                      },
                      animatedStyle
                    ]}
                    resizeMode="contain" 
                  />
                </GestureDetector>
                
                {/* Grid Overlay */}
                <View style={styles.gridOverlay} pointerEvents="none">
                    <View style={styles.gridLineV1} />
                    <View style={styles.gridLineV2} />
                    <View style={styles.gridLineH1} />
                    <View style={styles.gridLineH2} />
                </View>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            
            {showRatioPicker && !isRatioLocked && (
              <View style={styles.ratioPickerContainer}>
                 <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.ratioPickerContent}
                 >
                   {RATIOS.map((r) => {
                     const isActive = selectedRatioId === r.id;
                     const IconComp = r.icon;
                     const labelText = r.id === 'original' 
                       ? (t('imageEditor:ratio_original'))
                       : r.label;

                     return (
                       <Pressable
                         key={r.id}
                         onPress={() => {
                             setSelectedRatioId(r.id);
                             setCustomRatio(null); 
                             setIsRatioInverted(false); 
                         }}
                         style={[
                             styles.ratioBtn, 
                             isActive && { backgroundColor: '#333', borderColor: editorAccent }
                         ]}
                       >
                         {IconComp && <IconComp size={16} color={isActive ? editorAccent : '#888'} style={{marginBottom:4}} />}
                         <Text style={[styles.ratioText, isActive && { color: editorAccent, fontWeight: '700' }]}>
                           {labelText}
                         </Text>
                       </Pressable>
                     );
                   })}
                 </ScrollView>
              </View>
            )}

            {/* 메인 툴바 */}
            <View style={styles.mainToolbar}>
              
              <Pressable 
                style={styles.toolBtn} 
                onPress={() => setRotation((p) => (p + 90) % 360)}
              >
                <RotateCw color="#fff" size={22} />
                <Text style={styles.toolText}>{t('imageEditor:rotate')}</Text>
              </Pressable>

              <Pressable 
                style={[styles.toolBtn, isRatioLocked && { opacity: 0.3 }]} 
                onPress={() => !isRatioLocked && setShowRatioPicker(prev => !prev)}
                disabled={isRatioLocked}
              >
                <Scan color={showRatioPicker ? editorAccent : "#fff"} size={22} />
                <Text style={[styles.toolText, showRatioPicker && { color: editorAccent }]}>
                  {t('imageEditor:ratio')}
                </Text>
              </Pressable>
              
              <Pressable 
                style={[styles.toolBtn, (isRatioLocked || selectedRatioId === '1:1') && { opacity: 0.3 }]} 
                onPress={() => !isRatioLocked && setIsRatioInverted(prev => !prev)}
                disabled={isRatioLocked || selectedRatioId === '1:1'}
              >
                {isRatioInverted ? (
                  <RectangleVertical color="#fff" size={22} />
                ) : (
                  <RectangleHorizontal color="#fff" size={22} />
                )}
                <Text style={styles.toolText}>
                   {t('imageEditor:orientation')}
                </Text>
              </Pressable>
              
              <Pressable 
                style={styles.toolBtn} 
                onPress={() => {
                    setRotation(0);
                    if (initialRatio) {
                        const match = RATIOS.find(r => r.value && Math.abs(r.value - initialRatio) < 0.02);
                        setSelectedRatioId(match ? match.id : 'custom');
                        setCustomRatio(initialRatio);
                    } else {
                        setSelectedRatioId('original');
                        setCustomRatio(null);
                    }
                    setIsRatioInverted(false);
                    setShowRatioPicker(false);
                    resetTransform();
                }}
              >
                <RefreshCcw color="#fff" size={22} />
                <Text style={styles.toolText}>{t('imageEditor:reset')}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  
  header: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    zIndex: 10,
  },
  headerCenter: { 
    alignItems: 'center' 
  },
  headerTitle: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  headerBtn: { 
    padding: 8, 
    minWidth: 40, 
    alignItems: 'center' 
  },
  
  workspace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  gridOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.25)' 
  },
  gridLineV1: { 
    position: 'absolute', 
    left: '33.33%', 
    top: 0, 
    bottom: 0, 
    width: 1, 
    backgroundColor: 'rgba(255,255,255,0.25)' 
  },
  gridLineV2: { 
    position: 'absolute', 
    left: '66.66%', 
    top: 0, 
    bottom: 0, 
    width: 1, 
    backgroundColor: 'rgba(255,255,255,0.25)' 
  },
  gridLineH1: { 
    position: 'absolute', 
    top: '33.33%', 
    left: 0, 
    right: 0, 
    height: 1, 
    backgroundColor: 'rgba(255,255,255,0.25)' 
  },
  gridLineH2: { 
    position: 'absolute', 
    top: '66.66%', 
    left: 0, 
    right: 0, 
    height: 1, 
    backgroundColor: 'rgba(255,255,255,0.25)' 
  },
  
  footer: {
    backgroundColor: '#000',
    paddingBottom: Platform.OS === 'ios' ? 0 : 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  
  mainToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    backgroundColor: '#000',
  },
  toolBtn: { 
    alignItems: 'center', 
    padding: 4, 
    width: 60 
  },
  toolText: { 
    color: '#fff', 
    fontSize: 11, 
    marginTop: 6, 
    fontWeight: '500' 
  },
  
  ratioPickerContainer: {
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  ratioPickerContent: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: 'center',
  },
  ratioBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#444',
    minWidth: 50,
  },
  ratioText: { 
    color: '#888', 
    fontSize: 12, 
    fontWeight: '500' 
  },
});