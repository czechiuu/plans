const signature = [137,80,78,71,13,10,26,10]
const allowed = new Set(['IHDR','IDAT','IEND','sRGB','gAMA','pHYs'])
const table = Uint32Array.from({length:256},(_,i)=>{
  let n=i
  for(let j=0;j<8;j++) n=(n&1)?0xedb88320^(n>>>1):n>>>1
  return n>>>0
})

function crc32(bytes,start,end){
  let crc=0xffffffff
  for(let i=start;i<end;i++) crc=table[(crc^bytes[i])&255]^(crc>>>8)
  return (crc^0xffffffff)>>>0
}

export async function validateSanitizedPng(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input)
  if(bytes.length<45 || bytes.length>4194304 || !signature.every((x,i)=>bytes[i]===x))
    throw new Error('INVALID_PNG')
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  let at=8,ihdr=false,idat=false,ended=false,width=0,height=0,chunks=0,colorType=0
  const imageChunks=[]
  while(at<bytes.length){
    if(++chunks>100 || at+12>bytes.length) throw new Error('INVALID_PNG')
    const length=view.getUint32(at)
    const type=String.fromCharCode(...bytes.slice(at+4,at+8))
    const data=at+8,end=data+length
    if(!allowed.has(type) || end+4>bytes.length || crc32(bytes,at+4,end)!==view.getUint32(end))
      throw new Error('INVALID_PNG')
    if(type==='IHDR'){
      if(ihdr || at!==8 || length!==13) throw new Error('INVALID_PNG')
      ihdr=true;width=view.getUint32(data);height=view.getUint32(data+4);colorType=bytes[data+9]
      if(width<1||height<1||width>4096||height>4096||bytes[data+8]!==8||
        ![2,6].includes(bytes[data+9])||bytes[data+10]!==0||bytes[data+11]!==0||bytes[data+12]!==0)
        throw new Error('INVALID_PNG')
    } else if(type==='IDAT'){
      if(!ihdr||ended) throw new Error('INVALID_PNG')
      idat=true
      imageChunks.push(bytes.subarray(data,end))
    } else if(type==='IEND'){
      if(!ihdr||!idat||length!==0||end+4!==bytes.length) throw new Error('INVALID_PNG')
      ended=true
    } else if(!ihdr||idat||ended) throw new Error('INVALID_PNG')
    at=end+4
  }
  if(!ended) throw new Error('INVALID_PNG')
  const scanlineBytes=1+width*(colorType===6?4:3)
  const expected=scanlineBytes*height
  let count=0
  try{
    const stream=new Blob(imageChunks).stream().pipeThrough(new DecompressionStream('deflate'))
    for await(const block of stream){
      for(const value of block){
        if(count>=expected || (count%scanlineBytes===0 && value>4)) throw new Error('INVALID_PNG')
        count++
      }
    }
  }catch{throw new Error('INVALID_PNG')}
  if(count!==expected) throw new Error('INVALID_PNG')
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')
  return {width,height,bytes:bytes.length,sha256,mime:'image/png'}
}
