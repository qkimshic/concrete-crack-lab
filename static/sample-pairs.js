const samplePairs = {
 realSample: {
  label: '실제 균열 사진 1',
  segment: true,
  photos: [
   {key:'reference',name:'IMG_0279.jpg',width:425,height:502,
    points:[[35,189],[100,219],[160,247],[216,273],[270,294],[315,309],[340,317],[365,325],[400,339]],
    roi:{x:262,y:256,width:12,height:34}},
   {key:'current',name:'IMG_0280.jpg',width:1109,height:1254,
    points:[[90,250],[260,330],[420,403],[570,466],[705,522],[822,566],[887,587],[952,609],[1043,650]],
    roi:{x:684,y:412,width:28,height:109}}
  ]
 },
 realSample2: {
  label: '실제 균열 사진 2',
  location: '콘크리트 보 · 측면',
  settings: {modelThreshold:.5,minimum:15},
  refine: false,
  photos: [
   {key:'reference',name:'beam-g6-earlier.jpg',width:1000,height:551,
    points:[[244,67],[710,109],[943,249],[946,462],[653,510],[387,487],[279,192],[523,304]],
    checkpoints:[[423,264],[829,416]]},
   {key:'current',name:'beam-g6-later.jpg',width:1000,height:496,
    points:[[328,49],[747,78],[956,202],[959,395],[696,448],[460,434],[361,164],[581,261]],
    checkpoints:[[491,228],[853,356]]}
  ]
 }
};
