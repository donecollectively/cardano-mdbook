import { useRouter } from 'next/router.js'

import { CertsPage } from './[...args].js';

// function RemoveSlash() {
//     const router = useRouter()
//     const path =  router.asPath
//     const fixed = path.replace(/\/$/, "");
//     router.replace(fixed);

//   }
  
//   export default RemoveSlash
  
export default  function withSlash(...props) {
    const router = useRouter()
    return <CertsPage router={router} />
}

withSlash.nextPrev = false